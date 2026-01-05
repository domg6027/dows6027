/**
 * daily.js
 * DOWS6027 – Daily Article PDF Generator (CORRECT & SAFE)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");

// ─────────────────────────────────────────────
// 1️⃣ ENSURE PDF DIRECTORY EXISTS
// ─────────────────────────────────────────────
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

// ─────────────────────────────────────────────
// 2️⃣ FAILSAFE: DELETE ALL LEGACY WRONG PDFs
// ─────────────────────────────────────────────
const BAD_PREFIX = "DOWS6027-DAILY-";

const existingPDFs = fs.readdirSync(PDF_DIR);
const legacyPDFs = existingPDFs.filter(f => f.startsWith(BAD_PREFIX));

if (legacyPDFs.length > 0) {
  console.warn(`⚠️ Removing ${legacyPDFs.length} legacy PDFs`);
  for (const file of legacyPDFs) {
    fs.unlinkSync(path.join(PDF_DIR, file));
  }
}

// ─────────────────────────────────────────────
// 3️⃣ LOAD OR REBUILD data.json
// ─────────────────────────────────────────────
let state;

const FALLBACK_STATE = {
  last_date_used: "2025-12-11",
  last_URL_processed: "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  current_date: "2025-12-11",
  last_article_number: 9256,
  generated: {}
};

if (!fs.existsSync(DATA_FILE)) {
  state = FALLBACK_STATE;
} else {
  try {
    state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    state.generated = state.generated || {};
  } catch {
    console.warn("⚠️ data.json corrupted – rebuilding");
    state = FALLBACK_STATE;
  }
}

// ─────────────────────────────────────────────
// 4️⃣ ARTICLE SOURCE (YOU ALREADY HAVE THIS)
//     This function MUST return one object PER ARTICLE
// ─────────────────────────────────────────────
function fetchArticles() {
  /**
   * EXPECTED FORMAT:
   * [
   *   {
   *     id: 9271,
   *     date: "20260105",
   *     url: "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9271",
   *     htmlPath: "/absolute/path/to/rendered.html"
   *   }
   * ]
   */
  return globalThis.ARTICLES || [];
}

// ─────────────────────────────────────────────
// 5️⃣ PDF GENERATION
// ─────────────────────────────────────────────
function generatePDF(htmlPath, pdfPath) {
  execSync(
    `wkhtmltopdf --quiet "${htmlPath}" "${pdfPath}"`,
    { stdio: "inherit" }
  );
}

// ─────────────────────────────────────────────
// 6️⃣ MAIN
// ─────────────────────────────────────────────
(async function run() {
  console.log("▶ DAILY PDF RUN STARTED");

  const articles = fetchArticles();
  let created = 0;

  for (const article of articles) {
    const { id, date, url, htmlPath } = article;

    if (!id || !date || !htmlPath) continue;

    const pdfName = `${date}-${id}.pdf`;
    const pdfFullPath = path.join(PDF_DIR, pdfName);

    if (fs.existsSync(pdfFullPath)) {
      continue; // already generated
    }

    generatePDF(htmlPath, pdfFullPath);

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

  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  console.log(`✅ PDFs created this run: ${created}`);
})();
