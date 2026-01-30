import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import { generate } from "@pdfme/generator";

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");
const BLANK_PDF = path.join(ROOT, "blank.pdf");

if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
if (!fs.existsSync(BLANK_PDF)) {
  throw new Error("blank.pdf missing in repository root");
}

// ---- Git identity (CI-safe) ----
try {
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git config user.name "GitHub Actions"`);
} catch {}

// ---- Helpers ----
function fetchArticle(id) {
  return new Promise((resolve, reject) => {
    https.get(`https://pnw.org.za/?p=${id}`, res => {
      if (res.statusCode === 302 || res.statusCode === 404) {
        resolve(null); // LOOP trigger
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// ---- Split into 1800–2200 char chunks ----
function chunkText(text, min = 1800, max = 2200) {
  const chunks = [];
  let pos = 0;

  while (pos < text.length) {
    let size = Math.min(max, text.length - pos);
    let slice = text.slice(pos, pos + size);
    const lastSpace = slice.lastIndexOf(" ");
    if (slice.length > min && lastSpace > min) {
      slice = slice.slice(0, lastSpace);
      size = slice.length;
    }
    chunks.push(slice.trim());
    pos += size;
  }
  return chunks;
}

// ---- MAIN ----
export async function runOnePdf(startId) {
  let articleId = startId;

  while (true) {
    console.log(`➡ Trying article ${articleId}`);
    const html = await fetchArticle(articleId);

    // ONLY loop point
    if (!html) {
      articleId++;
      continue;
    }

    const cleanText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = chunkText(cleanText);
    if (!chunks.length) {
      articleId++;
      continue;
    }

    const pdfPath = path.join(PDF_DIR, `PNW-${articleId}.pdf`);

    const template = {
      basePdf: BLANK_PDF,
      schemas: chunks.map(() => ({
        body: {
          type: "text",
          position: { x: 40, y: 40 },
          width: 515,
          height: 760,
          fontSize: 11
        }
      }))
    };

    const inputs = chunks.map(c => ({ body: c }));

    const pdfBuffer = await generate({ template, inputs });
    fs.writeFileSync(pdfPath, Buffer.from(pdfBuffer));

    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF generation failed");
    }

    // ---- COMMIT PDF FIRST ----
    execSync(`git add "${pdfPath}"`);
    execSync(`git commit -m "Add PNW article ${articleId}"`);

    // ---- Update data.json ONLY AFTER SUCCESS ----
    const data = fs.existsSync(DATA_FILE)
      ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
      : {};

    data.last_article_number = articleId;

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    execSync(`git add "${DATA_FILE}"`);
    execSync(`git commit -m "Update last_article_number to ${articleId}"`);

    console.log(`✔ Article ${articleId} committed`);
    return articleId;
  }
}
