/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * FINAL CLEAN VERSION
 * Node 20+ | ES Modules | wkhtmltopdf
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import https from "https";

/* ─────────────────────────────────────── */
/* 🔰 BOOT */
/* ─────────────────────────────────────── */

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ─────────────────────────────────────── */
/* 🧹 SAFETY CLEANUP */
/* ─────────────────────────────────────── */

for (const f of fs.readdirSync(PDF_DIR)) {
  if (f.startsWith("DOWS6027-DAILY-")) {
    fs.unlinkSync(path.join(PDF_DIR, f));
    console.log("🗑 Removed legacy PDF:", f);
  }
}

/* ─────────────────────────────────────── */
/* 📄 STATE LOAD */
/* ─────────────────────────────────────── */

const DEFAULT_STATE = {
  last_date_used: "2025-12-11",
  last_URL_processed: "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  current_date: "2025-12-11",
  last_article_number: 9256
};

let state = DEFAULT_STATE;
if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.warn("⚠️ data.json invalid — using fallback");
  }
}

let lastArticle = Number(state.last_article_number) || 9256;

/* ─────────────────────────────────────── */
/* 🌐 FETCH HELPERS */
/* ─────────────────────────────────────── */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

/* ─────────────────────────────────────── */
/* 📰 FIND NEW ARTICLES */
/* ─────────────────────────────────────── */

const ARCHIVE_URL = "https://www.prophecynewswatch.com/archive.cfm";
const archiveHTML = await fetch(ARCHIVE_URL);

const ids = [...archiveHTML.matchAll(/recent_news_id=(\d+)/g)]
  .map(m => Number(m[1]))
  .filter(n => n > lastArticle)
  .sort((a, b) => a - b);

console.log(`📰 New articles found: ${ids.length}`);

if (!ids.length) {
  console.log("✔ Nothing to process");
  process.exit(0);
}

/* ─────────────────────────────────────── */
/* 📄 PROCESS ARTICLES */
/* ─────────────────────────────────────── */

for (const id of ids) {
  const url = `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;
  console.log("➡ Processing", url);

  let html;
  try {
    html = await fetch(url);
  } catch {
    console.warn("⚠️ Fetch failed, skipping", id);
    continue;
  }

  const dateMatch =
    html.match(/(\d{4})-(\d{2})-(\d{2})/) ||
    html.match(/(\w+ \d{1,2}, \d{4})/);

  let ymd;
  if (dateMatch) {
    const d = new Date(dateMatch[0]);
    ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  } else {
    const d = new Date();
    ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    console.warn("⚠️ Date not found — using UTC today");
  }

  const tmpHTML = path.join(TMP_DIR, `${id}.html`);
  const pdfFile = `${ymd}-${id}.pdf`;
  const pdfPath = path.join(PDF_DIR, pdfFile);

  fs.writeFileSync(tmpHTML, html, "utf8");

  try {
    execFileSync("wkhtmltopdf", ["--quiet", tmpHTML, pdfPath], {
      stdio: "ignore"
    });
    console.log("✅ PDF created:", pdfFile);
  } catch (e) {
    console.error("❌ wkhtmltopdf failed for", id);
    continue;
  }

  lastArticle = id;
}

/* ─────────────────────────────────────── */
/* 📝 SAVE STATE */
/* ─────────────────────────────────────── */

const today = new Date().toISOString().slice(0, 10);

const newState = {
  last_date_used: today,
  last_URL_processed: `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${lastArticle}`,
  current_date: today,
  last_article_number: lastArticle
};

fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));

console.log("💾 data.json updated");

/* ─────────────────────────────────────── */
/* 🏁 END */
/* ─────────────────────────────────────── */

console.log("✔ DAILY RUN COMPLETE");
