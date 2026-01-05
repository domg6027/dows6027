/**
 * DOWS6027 – DAILY ARTICLE PDF GENERATOR (HARDENED)
 * ENGINE: Playwright (Chromium)
 * MODE: Batch-safe, CI-stable
 */

import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import fetch from "node-fetch";

/* ─────────────────────────────────────── */
/* 🔥 START */
/* ─────────────────────────────────────── */

console.log("▶ DAILY RUN START:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const STATE_DIR = path.join(ROOT, "state");
const STATE_FILE = path.join(STATE_DIR, "lastRun.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

/* ─────────────────────────────────────── */
/* 🧹 DELETE WRONG PDFs */
/* ─────────────────────────────────────── */

for (const f of fs.readdirSync(PDF_DIR)) {
  if (f.startsWith("DOWS6027-DAILY-")) {
    fs.unlinkSync(path.join(PDF_DIR, f));
    console.log("🗑 Deleted invalid PDF:", f);
  }
}

/* ─────────────────────────────────────── */
/* 📄 LOAD STATE */
/* ─────────────────────────────────────── */

const DEFAULT_STATE = {
  last_date_used: "2025-12-11",
  last_URL_processed: "",
  current_date: "2025-12-11",
  last_article_number: 9256
};

let state = DEFAULT_STATE;
if (fs.existsSync(STATE_FILE)) {
  state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
}

console.log("📘 LAST ARTICLE:", state.last_article_number);

/* ─────────────────────────────────────── */
/* 📰 FETCH ARCHIVE */
/* ─────────────────────────────────────── */

const archiveURL = "https://www.prophecynewswatch.com/articles.cfm";
const archiveHTML = await fetch(archiveURL).then(r => r.text());

const articleRegex = /article\.cfm\?recent_news_id=(\d+)/g;
const articleIDs = [...archiveHTML.matchAll(articleRegex)]
  .map(m => Number(m[1]))
  .filter(id => id > state.last_article_number)
  .sort((a, b) => a - b);

console.log(`📰 New articles found: ${articleIDs.length}`);
if (!articleIDs.length) process.exit(0);

/* ─────────────────────────────────────── */
/* 🖨 PDF GENERATION */
/* ─────────────────────────────────────── */

const browser = await chromium.launch();
const page = await browser.newPage();

for (const id of articleIDs) {
  try {
    const url = `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;
    console.log("➡ Processing:", url);

    const html = await fetch(url).then(r => r.text());

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const dateObj = dateMatch ? new Date(dateMatch[1]) : new Date();

    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getUTCDate()).padStart(2, "0");
    const dateStamp = `${y}${m}${d}`;

    const pdfName = `${dateStamp}-${id}.pdf`;
    const pdfPath = path.join(PDF_DIR, pdfName);

    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });

    console.log("✅ PDF CREATED:", pdfName);

    state.last_article_number = id;
    state.last_URL_processed = url;
    state.current_date = `${y}-${m}-${d}`;

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  } catch (err) {
    console.error("❌ FAILED ARTICLE:", id, err.message);
    continue;
  }
}

await browser.close();

console.log("🏁 DAILY RUN COMPLETE");
