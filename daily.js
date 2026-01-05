/**
 * daily.js
 * DOWS6027 – Daily Article PDF Generator (ESM SAFE)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

/* ─────────────────────────────────────── */
/* 📂 ABSOLUTE PATH RESOLUTION (ESM) */
/* ─────────────────────────────────────── */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");

/* ─────────────────────────────────────── */
/* 📁 ENSURE DIRECTORIES */
/* ─────────────────────────────────────── */

fs.mkdirSync(PDF_DIR, { recursive: true });

/* ─────────────────────────────────────── */
/* 🧹 REMOVE WRONG LEGACY PDFs */
/* ─────────────────────────────────────── */

const BAD_PREFIX = "DOWS6027-DAILY-";

for (const file of fs.readdirSync(PDF_DIR)) {
  if (file.startsWith(BAD_PREFIX)) {
    fs.unlinkSync(path.join(PDF_DIR, file));
    console.warn("🧹 Removed legacy PDF:", file);
  }
}

/* ─────────────────────────────────────── */
/* 🧠 LOAD / FALLBACK STATE */
/* ─────────────────────────────────────── */

const FALLBACK_STATE = {
  last_date_used: "2025-12-11",
  last_URL_processed:
    "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  current_date: "2025-12-11",
  last_article_number: 9256,
  generated: {}
};

let state;

try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  state.generated ||= {};
} catch {
  console.warn("⚠️ data.json missing or corrupt – using fallback");
  state = FALLBACK_STATE;
}

/* ─────────────────────────────────────── */
/* 🔎 ARTICLE SOURCE (ALREADY IN YOUR PIPE) */
/* ─────────────────────────────────────── */

function fetchArticles() {
  /**
   * MUST RETURN:
   * [
   *   {
   *     id: 9271,
   *     date: "20260105",
   *     url: "...",
   *     htmlPath: "/abs/path/article.html"
   *   }
   * ]
   */
  return globalThis.ARTICLES || [];
}

/* ─────────────────────────────────────── */
/* 🖨 PDF GENERATION */
/* ─────────────────────────────────────── */

function generatePDF(htmlPath, pdfPath) {
  execSync(
    `wkhtmltopdf --quiet "${htmlPath}" "${pdfPath}"`,
    { stdio: "inherit" }
  );
}

/* ─────────────────────────────────────── */
/* ▶ MAIN */
/* ─────────────────────────────────────── */

console.log("▶ DAILY PDF RUN STARTED");

const articles = fetchArticles();
let created = 0;

for (const article of articles) {
  const { id, date, url, htmlPath } = article;

  if (!id || !date || !htmlPath) continue;

  const pdfName = `${date}-${id}.pdf`;
  const pdfPath = path.join(PDF_DIR, pdfName);

  if (fs.existsSync(pdfPath)) continue;

  generatePDF(htmlPath, pdfPath);

  state.generated[id] = {
    date,
    url,
    pdf: `PDFS/${pdfName}`
  };

  state.last_article_number = Math.max(
    state.last_article_number || 0,
    id
  );

  state.current_date = date;
  state.last_URL_processed = url;

  created++;
}

fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");

console.log(`✅ PDFs created this run: ${created}`);
console.log("🏁 DAILY RUN COMPLETE");
