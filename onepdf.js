import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import { generate } from "@pdfme/generator";
import { text } from "@pdfme/common";

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");

if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR);

// ---- Git identity (CI-safe) ----
try {
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git config user.name "GitHub Actions"`);
} catch {}

// ---- Helpers ----
function fetchArticle(id) {
  return new Promise((resolve, reject) => {
    const url = `https://pnw.org.za/?p=${id}`;

    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 404) {
        resolve(null); // LOOP trigger
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = "";
      res.on("data", d => data += d);
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

    // avoid mid-word breaks
    let lastSpace = slice.lastIndexOf(" ");
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

    // ONLY place where looping happens
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

    const pdfPath = path.join(PDF_DIR, `PNW-${articleId}.pdf`);

    const template = {
      basePdf: { width: 595, height: 842 },
      schemas: [{
        body: {
          type: text,
          position: { x: 40, y: 40 },
          width: 515,
          height: 760,
          fontSize: 11
        }
      }]
    };

    await generate({
      template,
      inputs: chunks.map(c => ({ body: c }))
    }).then(buf => fs.writeFileSync(pdfPath, buf));

    // ---- Git commit PDF FIRST ----
    try {
      execSync(`git add "${pdfPath}"`);
      execSync(`git commit -m "Add PNW article ${articleId}"`);
    } catch (e) {
      console.error("❌ Git commit failed for PDF:", articleId);
      throw e;
    }

    // ---- Update data.json ONLY NOW ----
    let data = {};
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }

    data.lastProcessed = articleId;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    execSync(`git add "${DATA_FILE}"`);
    execSync(`git commit -m "Update lastProcessed to ${articleId}"`);

    console.log(`✔ Article ${articleId} committed`);
    return articleId;
  }
}
