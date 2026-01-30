/**
 * onepdf.js
 * Generates ONE PNW article PDF per run
 * Commits PDF + data.json
 * Node 20 – GitHub Actions safe
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import { generate } from "@pdfme/generator";

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");
const BLANK_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

/* -------------------- GUARDS -------------------- */

if (!fs.existsSync(BLANK_PDF)) {
  throw new Error("blank.pdf missing in TEMPLATES folder");
}

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR);
}

if (!fs.existsSync(DATA_FILE)) {
  throw new Error("data.json missing in repository root");
}

/* -------------------- GIT IDENTITY (CI SAFE) -------------------- */

try {
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git config user.name "GitHub Actions"`);
} catch {}

/* -------------------- HELPERS -------------------- */

function fetchArticle(id) {
  return new Promise((resolve, reject) => {
    const url =
      `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;

    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 404) {
        resolve(null);
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

function chunkText(text, max = 2000) {
  const chunks = [];
  let pos = 0;

  while (pos < text.length) {
    chunks.push(text.slice(pos, pos + max));
    pos += max;
  }

  return chunks;
}

function advanceState(id) {
  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  state.last_article_number = id;
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

/* -------------------- MAIN -------------------- */

(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let articleId = state.last_article_number + 1;

  const MAX_MISSES = 20;
  let misses = 0;

  while (true) {
    console.log(`➡ Trying article ${articleId}`);

    const html = await fetchArticle(articleId);

    /* ---- HARD SKIP: missing article ---- */
    if (!html) {
      misses++;
      advanceState(articleId);
      articleId++;

      if (misses >= MAX_MISSES) {
        console.log("🛑 Too many missing articles — stopping");
        return;
      }
      continue;
    }

    misses = 0;

    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    /* ---- HARD SKIP: junk content ---- */
    if (
      cleanText.length < 200 ||
      /page not found|error|redirect/i.test(cleanText)
    ) {
      console.warn("⚠ Junk article:", articleId);
      advanceState(articleId);
      articleId++;
      continue;
    }

    const chunks = chunkText(cleanText);
    const MAX_PAGES = 15;

    const template = {
      basePdf: fs.readFileSync(BLANK_PDF),
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

    const inputs = chunks
      .slice(0, MAX_PAGES)
      .map(c => ({ body: c }));

    const result = await generate({ template, inputs });

    const rawPdf =
      result?.buffer ||
      result?.pdf ||
      result?.data;

    if (!rawPdf || !rawPdf.length) {
      console.error("❌ Empty PDF buffer for", articleId);
      advanceState(articleId);
      articleId++;
      continue;
    }

    const buffer = Buffer.isBuffer(rawPdf)
      ? rawPdf
      : Buffer.from(rawPdf);

    const pdfPath = path.join(PDF_DIR, `PNW-${articleId}.pdf`);
    fs.writeFileSync(pdfPath, buffer);

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF not written for ${articleId}`);
    }

    /* -------------------- GIT COMMIT PDF -------------------- */

    execSync(`git add "${pdfPath}"`);
    execSync(`git commit -m "Add PNW article ${articleId}"`);

    /* -------------------- UPDATE STATE -------------------- */

    advanceState(articleId);
    execSync(`git add "${DATA_FILE}"`);
    execSync(
      `git commit -m "Update last_article_number to ${articleId}"`
    );

    console.log(`✅ Git commit executed for article ${articleId}`);
    return;
  }
})();
