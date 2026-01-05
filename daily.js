/**
 * DOWS6027 – DAILY RUN (GREGORIAN, HARDENED)
 * Node 20 – ES Module
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

/* ─────────────────────────────────────── */
/* 📂 PATH SETUP */
/* ─────────────────────────────────────── */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const DATA_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ─────────────────────────────────────── */
/* 🧹 REMOVE INVALID PDFs */
/* ─────────────────────────────────────── */

for (const f of fs.readdirSync(PDF_DIR)) {
  if (f.startsWith("DOWS6027-DAILY-")) {
    fs.unlinkSync(path.join(PDF_DIR, f));
    console.log("🧹 Deleted legacy PDF:", f);
  }
}

/* ─────────────────────────────────────── */
/* 🧠 LOAD STATE */
/* ─────────────────────────────────────── */

const FALLBACK = {
  last_date_used: "2025-12-11",
  last_URL_processed:
    "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  current_date: "2025-12-11",
  last_article_number: 9256
};

let state;
try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch {
  console.warn("⚠️ data.json missing – using fallback");
  state = FALLBACK;
}

/* ─────────────────────────────────────── */
/* 🌐 FETCH ARCHIVE */
/* ─────────────────────────────────────── */

async function fetchArchiveIds() {
  const res = await fetch("https://www.prophecynewswatch.com/");
  const html = await res.text();

  const ids = [...html.matchAll(/recent_news_id=(\d+)/g)]
    .map(m => Number(m[1]))
    .filter(n => n > state.last_article_number);

  return [...new Set(ids)].sort((a, b) => a - b);
}

/* ─────────────────────────────────────── */
/* 📅 DATE EXTRACTION (ROBUST) */
/* ─────────────────────────────────────── */

function extractDate(html) {
  const patterns = [
    /Published:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i,
    /Posted:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      return new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    }
  }

  // Meta tag fallback
  const meta = html.match(/content="(\d{4}-\d{2}-\d{2})"/);
  if (meta) {
    return new Date(meta[1]);
  }

  // Absolute fallback
  console.warn("⚠️ Date not found — using UTC today");
  return new Date();
}

/* ─────────────────────────────────────── */
/* 📰 FETCH ARTICLE */
/* ─────────────────────────────────────── */

async function fetchArticle(id) {
  const url = `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;
  const res = await fetch(url);
  const html = await res.text();

  const date = extractDate(html);
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");

  const htmlPath = path.join(TMP_DIR, `${id}.html`);
  fs.writeFileSync(htmlPath, html, "utf8");

  return { id, ymd, url, htmlPath };
}

/* ─────────────────────────────────────── */
/* 🖨 PDF */
/* ─────────────────────────────────────── */

function makePDF(htmlPath, pdfPath) {
  execSync(`wkhtmltopdf --quiet "${htmlPath}" "${pdfPath}"`);
}

/* ─────────────────────────────────────── */
/* ▶ MAIN */
/* ─────────────────────────────────────── */

console.log("▶ DAILY RUN START");

const ids = await fetchArchiveIds();
console.log("📰 New articles found:", ids.length);

for (const id of ids) {
  const article = await fetchArticle(id);

  const pdfName = `${article.ymd}-${id}.pdf`;
  const pdfPath = path.join(PDF_DIR, pdfName);

  if (fs.existsSync(pdfPath)) {
    console.log("⏭ Skipping existing:", pdfName);
    continue;
  }

  makePDF(article.htmlPath, pdfPath);
  console.log("✅ PDF CREATED:", pdfName);

  state.last_article_number = id;
  state.last_URL_processed = article.url;
  state.current_date = article.ymd;
}

fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");

console.log("🏁 DAILY RUN COMPLETE");
