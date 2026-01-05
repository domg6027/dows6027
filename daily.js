// daily.js — ES MODULE VERSION
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { execSync } from "child_process";

const BASE_URL = "https://www.prophecynewswatch.com";
const ARCHIVE_URL = `${BASE_URL}/article-archive/`;
const ROOT = process.cwd();

const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const DATA_FILE = path.join(ROOT, "data.json");

console.log("▶ DAILY RUN START");

/* ─────────────────────────────── */
/*  ENSURE DIRECTORIES EXIST       */
/* ─────────────────────────────── */
for (const dir of [PDF_DIR, TMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ─────────────────────────────── */
/*  DELETE WRONG PDFs SAFELY       */
/* ─────────────────────────────── */
for (const file of fs.readdirSync(PDF_DIR)) {
  if (file.startsWith("DOWS6027-DAILY-")) {
    fs.unlinkSync(path.join(PDF_DIR, file));
  }
}

/* ─────────────────────────────── */
/*  LOAD DATA.JSON                 */
/* ─────────────────────────────── */
let data = { processed: [] };
if (fs.existsSync(DATA_FILE)) {
  data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
const processedSet = new Set(data.processed);

/* ─────────────────────────────── */
/*  FETCH ARCHIVE PAGE             */
/* ─────────────────────────────── */
async function fetchArchive() {
  const res = await fetch(ARCHIVE_URL);
  const html = await res.text();

  const matches = [...html.matchAll(/\/article\/(\d{4})\//g)];
  const ids = [...new Set(matches.map(m => m[1]))];

  return ids.map(id => ({
    id,
    url: `${BASE_URL}/article/${id}/`
  }));
}

/* ─────────────────────────────── */
/*  EXTRACT ARTICLE DATE           */
/* ─────────────────────────────── */
function extractDate(html) {
  const m = html.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
  if (!m) return null;

  const d = new Date(m[1] + " UTC");
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/* ─────────────────────────────── */
/*  MAIN                           */
/* ─────────────────────────────── */
const browser = await chromium.launch();
const page = await browser.newPage();

const articles = await fetchArchive();
console.log(`📰 New articles found: ${articles.length}`);

for (const article of articles) {
  if (processedSet.has(article.id)) continue;

  try {
    await page.goto(article.url, { waitUntil: "domcontentloaded" });
    const html = await page.content();

    let ymd = extractDate(html);
    if (!ymd) {
      const d = new Date();
      ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;
      console.warn(`⚠️ Date not found for ${article.id} — using UTC today`);
    }

    const pdfName = `${ymd}-${article.id}.pdf`;
    const pdfPath = path.join(PDF_DIR, pdfName);

    if (fs.existsSync(pdfPath)) {
      processedSet.add(article.id);
      continue;
    }

    await page.pdf({
      path: pdfPath,
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true
    });

    processedSet.add(article.id);
    console.log(`✔ Created ${pdfName}`);

  } catch (err) {
    console.error(`✖ Failed article ${article.id}: ${err.message}`);
  }
}

/* ─────────────────────────────── */
/*  SAVE DATA.JSON                 */
/* ─────────────────────────────── */
fs.writeFileSync(
  DATA_FILE,
  JSON.stringify({ processed: [...processedSet].sort() }, null, 2)
);

await browser.close();
console.log("✔ DAILY RUN COMPLETE");
