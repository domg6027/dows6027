/**
 * onepdf.js — FINAL, pdfme-correct, CI-safe
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import { generate } from "@pdfme/generator";

/* ---------------- PATHS ---------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

/* ---------------- GUARDS ---------------- */

if (!fs.existsSync(BASE_PDF)) {
  throw new Error("blank.pdf missing in TEMPLATES folder");
}
if (!fs.existsSync(DATA_FILE)) {
  throw new Error("data.json missing in repository root");
}
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR);
}

/* ---------------- GIT IDENTITY ---------------- */

try {
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git config user.name "GitHub Actions"`);
} catch {}

/* ---------------- FETCH ---------------- */

function fetchArticle(id) {
  return new Promise(resolve => {
    const url = `https://www.prophecynewswatch.com/?p=${id}`;

    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        if (res.statusCode === 302 || res.statusCode === 404) {
          resolve(null); // LOOP
          return;
        }

        if (res.statusCode !== 200) {
          resolve(null); // treat all other HTTP errors as skip
          return;
        }

        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      })
      .on("error", () => resolve(null)); // DNS / network → LOOP
  });
}

/* ---------------- CHUNKER ---------------- */

function chunkText(str, min = 1800, max = 2200) {
  const chunks = [];
  let pos = 0;

  while (pos < str.length) {
    let size = Math.min(max, str.length - pos);
    let slice = str.slice(pos, pos + size);

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

/* ---------------- MAIN ---------------- */

(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let articleId = state.last_article_number + 1;

  while (true) {
    console.log(`➡ Trying article ${articleId}`);

    const html = await fetchArticle(articleId);

    // ONLY loop condition
    if (!html) {
      articleId++;
      continue;
    }

    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = chunkText(cleanText);
    const pdfPath = path.join(PDF_DIR, `PNW-${articleId}.pdf`);

    const template = {
      basePdf: fs.readFileSync(BASE_PDF),
      schemas: [
        {
          body: {
            type: "text", // ✅ MUST be string
            position: { x: 40, y: 40 },
            width: 515,
            height: 760,
            fontSize: 11
          }
        }
      ]
    };

    const pdfBuffer = await generate({
      template,
      inputs: chunks.map(c => ({ body: c }))
    });

    fs.writeFileSync(pdfPath, pdfBuffer);

    // ---- COMMIT PDF FIRST ----
    execSync(`git add "${pdfPath}"`);
    execSync(`git commit -m "Add PNW article ${articleId}"`);

    // ---- UPDATE STATE ----
    state.last_article_number = articleId;
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

    execSync(`git add "${DATA_FILE}"`);
    execSync(`git commit -m "Update last_article_number to ${articleId}"`);

    console.log(`✔ Article ${articleId} committed`);
    process.exit(0);
  }
})();
