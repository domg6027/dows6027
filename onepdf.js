import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import { generate } from "@pdfme/generator";

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");
const BLANK_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

/* ---------- Guards ---------- */
if (!fs.existsSync(BLANK_PDF)) {
  throw new Error("blank.pdf missing in TEMPLATES folder");
}
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR);
}

/* ---------- Git identity ---------- */
try {
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git config user.name "GitHub Actions"`);
} catch {}

/* ---------- Fetch ---------- */
function fetchArticle(id) {
  return new Promise((resolve, reject) => {
    const url = `https://www.prophecynewswatch.com/?p=${id}`;

    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 404) {
        resolve(null); // ONLY LOOP CONDITION
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let html = "";
      res.on("data", d => (html += d));
      res.on("end", () => resolve(html));
    }).on("error", reject);
  });
}

/* ---------- Chunk ---------- */
function chunkText(text, size = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/* ---------- MAIN ---------- */
(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let articleId = state.last_article_number + 1;

  while (true) {
    console.log(`➡ Trying article ${articleId}`);

    const html = await fetchArticle(articleId);
    if (!html) {
      articleId++;
      continue;
    }

    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = chunkText(cleanText);

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

    const inputs = chunks.map(c => ({ body: c }));
    const pdf = await generate({ template, inputs });

    const pdfPath = path.join(PDF_DIR, `PNW-${articleId}.pdf`);
    fs.writeFileSync(pdfPath, pdf);

    /* ---------- Commit PDF ---------- */
    execSync(`git add "${pdfPath}"`);
    execSync(`git commit -m "Add PNW article ${articleId}"`);

    /* ---------- Update ROOT state ---------- */
    state.last_article_number = articleId;
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

    execSync(`git add "${DATA_FILE}"`);
    execSync(`git commit -m "Update last_article_number to ${articleId}"`);

    console.log(`✅ Git commit executed for article ${articleId}`);
    process.exit(0);
  }
})();
