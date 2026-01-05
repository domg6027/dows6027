/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * STABLE PRODUCTION VERSION
 * ES MODULE SAFE
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import https from "https";

/* ─────────────────────────────────────── */
/* 🔥 HARD START */
/* ─────────────────────────────────────── */

console.log("▶ DAILY RUN START");
console.log("🕒", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

/* ─────────────────────────────────────── */
/* 📁 ENSURE DIRS */
/* ─────────────────────────────────────── */

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ─────────────────────────────────────── */
/* 🧹 DELETE WRONG PDFs */
/* ─────────────────────────────────────── */

const wrong = fs.readdirSync(PDF_DIR).filter(f =>
  f.startsWith("DOWS6027-DAILY-")
);

if (wrong.length) {
  console.log("🧹 Removing wrong PDFs:", wrong.length);
  for (const f of wrong) {
    fs.unlinkSync(path.join(PDF_DIR, f));
  }
}

/* ─────────────────────────────────────── */
/* 🧠 LOAD / FALLBACK STATE */
/* ─────────────────────────────────────── */

let state = {
  last_date_used: "2025-12-11",
  last_URL_processed:
    "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  current_date: "2025-12-11",
  last_article_number: 9256
};

if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.log("⚠️ State file corrupt — using fallback");
  }
}

/* ─────────────────────────────────────── */
/* 🌐 FETCH HELPER */
/* ─────────────────────────────────────── */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

/* ─────────────────────────────────────── */
/* 📰 FETCH ARCHIVE */
/* ─────────────────────────────────────── */

const ARCHIVE =
  "https://www.prophecynewswatch.com/news.cfm?recent=1";

const archiveHTML = await fetch(ARCHIVE);

const ids = [...archiveHTML.matchAll(/recent_news_id=(\d+)/g)]
  .map(m => Number(m[1]))
  .filter(id => id > state.last_article_number)
  .sort((a, b) => a - b);

console.log("📰 New articles found:", ids.length);

if (!ids.length) {
  console.log("✔ Nothing new");
  process.exit(0);
}

/* ─────────────────────────────────────── */
/* 🛠 PROCESS ARTICLES */
/* ─────────────────────────────────────── */

for (const id of ids) {
  const url = `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;
  console.log("➡ Processing", id);

  let html;
  try {
    html = await fetch(url);
  } catch (e) {
    console.log("❌ Fetch failed:", id);
    continue;
  }

  let dateMatch = html.match(
    /([A-Z][a-z]+ \d{1,2}, \d{4})/
  );

  let date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  if (dateMatch) {
    date = new Date(dateMatch[1])
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
  } else {
    console.log("⚠️ Date not found — using UTC today");
  }

  const tmpHTML = path.join(TMP_DIR, `${id}.html`);
  const pdf = path.join(PDF_DIR, `${date}-${id}.pdf`);

  fs.writeFileSync(tmpHTML, html, "utf8");

  try {
    execSync(
      `wkhtmltopdf --quiet --disable-smart-shrinking --load-error-handling ignore "${tmpHTML}" "${pdf}"`,
      { stdio: "ignore" }
    );
    console.log("✅ PDF created:", path.basename(pdf));
  } catch {
    console.log("❌ wkhtmltopdf failed:", id);
    continue;
  }

  state.last_article_number = id;
  state.last_URL_processed = url;
  state.current_date = date;
}

/* ─────────────────────────────────────── */
/* 💾 SAVE STATE */
/* ─────────────────────────────────────── */

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log("💾 State updated");

/* ─────────────────────────────────────── */
/* 🏁 END */
/* ─────────────────────────────────────── */

console.log("🏁 DAILY RUN COMPLETE");

