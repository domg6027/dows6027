/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * wkhtmltopdf SAFE VERSION
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execFileSync } from "child_process";

/* ─────────────────────────────────────── */
/* BOOT */
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
/* CLEAN WRONG PDFs */
/* ─────────────────────────────────────── */

for (const f of fs.readdirSync(PDF_DIR)) {
  if (f.startsWith("DOWS6027-DAILY-")) {
    fs.unlinkSync(path.join(PDF_DIR, f));
  }
}

/* ─────────────────────────────────────── */
/* STATE */
/* ─────────────────────────────────────── */

const FALLBACK = {
  last_date_used: "2025-12-11",
  last_URL_processed: "",
  current_date: "2025-12-11",
  last_article_number: 9256
};

let state = FALLBACK;
if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {}
}

let lastProcessed = Number(state.last_article_number) || 9256;

/* ─────────────────────────────────────── */
/* FETCH */
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
/* FIND NEW IDS (DEDUPED) */
/* ─────────────────────────────────────── */

const archive = await fetch("https://www.prophecynewswatch.com/archive.cfm");

const ids = [...new Set(
  [...archive.matchAll(/recent_news_id=(\d+)/g)]
    .map(m => Number(m[1]))
    .filter(id => id > lastProcessed)
)].sort((a, b) => a - b);

console.log("📰 New articles found:", ids.length);
if (!ids.length) process.exit(0);

/* ─────────────────────────────────────── */
/* PROCESS */
/* ─────────────────────────────────────── */

for (const id of ids) {
  console.log("➡ Processing", id);

  let html;
  try {
    html = await fetch(`https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`);
  } catch {
    console.warn("⚠️ Fetch failed:", id);
    continue;
  }

  const bodyMatch = html.match(/<div class="article-content">([\s\S]*?)<\/div>/i);
  if (!bodyMatch) {
    console.warn("⚠️ Article body not found:", id);
    continue;
  }

  const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
  const d = dateMatch ? new Date(dateMatch[1]) : new Date();

  const ymd =
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

  const safeHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Prophecy News Watch</title>
<style>
body { font-family: serif; margin: 2em; }
h1,h2,h3 { color:#222; }
a { color:#000; text-decoration:none; }
</style>
</head>
<body>
${bodyMatch[1]}
</body>
</html>
`;

  const tmp = path.join(TMP_DIR, `${id}.html`);
  const pdf = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

  fs.writeFileSync(tmp, safeHTML, "utf8");

  try {
    execFileSync("wkhtmltopdf", ["--quiet", tmp, pdf]);
    console.log("✅ PDF created:", `${ymd}-${id}.pdf`);
    lastProcessed = id;
  } catch {
    console.error("❌ PDF failed:", id);
  }
}

/* ─────────────────────────────────────── */
/* SAVE STATE */
/* ─────────────────────────────────────── */

const today = new Date().toISOString().slice(0, 10);

fs.writeFileSync(
  STATE_FILE,
  JSON.stringify(
    {
      last_date_used: today,
      last_URL_processed: `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${lastProcessed}`,
      current_date: today,
      last_article_number: lastProcessed
    },
    null,
    2
  )
);

console.log("💾 data.json updated");
console.log("✔ DAILY RUN COMPLETE");
