/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * HARDENED wkhtmltopdf VERSION
 * Stable against site DOM changes & cron stalls
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
/* STATE */
/* ─────────────────────────────────────── */

const FALLBACK = {
  last_article_number: 9256
};

let state = FALLBACK;
if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.warn("⚠️ data.json corrupted, using fallback");
  }
}

let lastProcessed =
  Number(state.last_article_number) || FALLBACK.last_article_number;

/* ─────────────────────────────────────── */
/* SAFE FETCH WITH TIMEOUT */
/* ─────────────────────────────────────── */

function fetch(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => resolve(data));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Fetch timeout"));
    });

    req.on("error", reject);
  });
}

/* ─────────────────────────────────────── */
/* ARTICLE BODY EXTRACTION */
/* ─────────────────────────────────────── */

function extractArticleBody(html) {
  // Anchor on <article class="post">
  const articleMatch = html.match(
    /<article[^>]+class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/article>/i
  );
  if (!articleMatch) return null;

  // Extract <div class="entry_content">
  const entryMatch = articleMatch[1].match(
    /<div[^>]+class="[^"]*entry_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (!entryMatch) return null;

  let body = entryMatch[1];

  // Strip ads / noise
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<ins[\s\S]*?<\/ins>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<center[\s\S]*?<\/center>/gi, "")
    .replace(/<img[^>]*>/gi, "");

  return body.trim();
}

/* ─────────────────────────────────────── */
/* FIND NEW IDS */
/* ─────────────────────────────────────── */

let archive;
try {
  archive = await fetch("https://www.prophecynewswatch.com/archive.cfm");
} catch (e) {
  console.error("❌ Archive fetch failed:", e.message);
  archive = "";
}

const ids = [...new Set(
  [...archive.matchAll(/recent_news_id=(\d+)/g)]
    .map(m => Number(m[1]))
    .filter(id => id > lastProcessed)
)].sort((a, b) => a - b);

console.log("📰 New articles found:", ids.length);
if (!ids.length) {
  console.log("ℹ️ Nothing new, clean exit");
}

/* ─────────────────────────────────────── */
/* PROCESS ARTICLES */
/* ─────────────────────────────────────── */

for (const id of ids) {
  console.log("➡ Processing", id);

  let html;
  try {
    html = await fetch(
      `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
    );
  } catch (e) {
    console.warn("⚠️ Fetch failed:", id, e.message);
    lastProcessed = id;
    continue;
  }

  const body = extractArticleBody(html);
  if (!body) {
    console.warn("⚠️ Article body not found:", id);
    lastProcessed = id;
    continue;
  }

  const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
  const d = dateMatch ? new Date(dateMatch[1]) : new Date();

  const ymd =
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
      d.getUTCDate()
    ).padStart(2, "0")}`;

  const filename = `${ymd}-${id}.pdf`;

  const safeHTML = `<!DOCTYPE html>
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
${body}
</body>
</html>`;

  const tmp = path.join(TMP_DIR, `${id}.html`);
  const pdf = path.join(PDF_DIR, filename);

  fs.writeFileSync(tmp, safeHTML, "utf8");

  try {
    execFileSync("wkhtmltopdf", ["--quiet", tmp, pdf], { timeout: 30000 });
    console.log("✅ PDF created:", filename);
  } catch {
    console.error("❌ PDF failed:", id);
  }

  lastProcessed = id; // ALWAYS advance
}

/* ─────────────────────────────────────── */
/* SAVE STATE */
/* ─────────────────────────────────────── */

fs.writeFileSync(
  STATE_FILE,
  JSON.stringify(
    {
      last_article_number: lastProcessed,
      updated_utc: new Date().toISOString()
    },
    null,
    2
  )
);

console.log("💾 data.json updated");
console.log("✔ DAILY RUN COMPLETE");
