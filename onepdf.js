import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { generate } from "@pdfme/generator";

/* ---------- CONSTANTS ---------- */
const DATA_FILE = "./data.json";
const PDF_DIR = "./pdfs";
const BLANK_PDF = "./blank.pdf";

/* ---------- SAFETY GUARDS ---------- */
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

if (!fs.existsSync(BLANK_PDF)) {
  console.error("❌ blank.pdf missing");
  process.exit(1);
}

/* ---------- FETCH COMPAT ---------- */
const fetchFn = global.fetch || (await import("node-fetch")).default;

/* ---------- HELPERS ---------- */
function chunkText(text, size = 1800) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

async function fetchArticle(id) {
  const urls = [
    `https://www.prophecynewswatch.com/article-${id}.html`,
    `https://www.prophecynewswatch.com/?p=${id}`
  ];

  for (const url of urls) {
    try {
      const res = await fetchFn(url, { redirect: "follow" });
      if (res.ok) return await res.text();
    } catch {
      /* try next */
    }
  }
  return null;
}

function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30000);
}

/* ---------- MAIN ---------- */
(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const articleId = state.last_article_number + 1;

  console.log(`➡ Trying article ${articleId}`);

  const html = await fetchArticle(articleId);
  if (!html) {
    console.log("❌ Article not found");
    process.exit(1);
  }

  const text = cleanHtml(html);
  if (text.length < 1000) {
    console.log("❌ Junk / empty article");
    process.exit(1);
  }

  const chunks = chunkText(text).slice(0, 15);
  const inputs = chunks.map(body => ({ body }));

  const template = {
    basePdf: BLANK_PDF,
    schemas: [
      {
        body: {
          type: "text",
          position: { x: 40, y: 40 },
          width: 515,
          height: 760,
          fontSize: 11
        }
      }
    ]
  };

  const result = await generate({ template, inputs });

  const rawPdf =
    result?.buffer ||
    result?.pdf ||
    result?.data ||
    result;

  if (!rawPdf || !rawPdf.length) {
    console.error("❌ PDF generation failed");
    process.exit(1);
  }

  const buffer = Buffer.from(rawPdf);
  const pdfPath = path.join(PDF_DIR, `PNW-${articleId}.pdf`);
  fs.writeFileSync(pdfPath, buffer);

  console.log(`📄 PDF written: ${pdfPath} (${buffer.length} bytes)`);

  /* ---------- STATE UPDATE ---------- */
  state.last_article_number = articleId;
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

  /* ---------- GIT COMMIT ---------- */
  execSync(`git add "${pdfPath}" "${DATA_FILE}"`);
  execSync(
    `git commit -m "Git commit executed for article ${articleId}"`,
    { stdio: "inherit" }
  );

  console.log(`✅ Article ${articleId} committed successfully`);
  process.exit(0);
})();
