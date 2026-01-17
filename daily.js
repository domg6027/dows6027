/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * FULLY HARDENED wkhtmltopdf VERSION
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

const FALLBACK = { last_article_number: 9256 };

let state = FALLBACK;
if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.warn("⚠️ data.json corrupted — using fallback");
  }
}

let lastProcessed =
  Number(state.last_article_number) || FALLBACK.last_article_number;

/* ─────────────────────────────────────── */
/* SAFE FETCH */
/* ─────────────────────────────────────── */

function fetch(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/120.0.0.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache"
        }
      },
      res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Fetch timeout"));
    });

    req.on("error", reject);
  });
}

/* ─────────────────────────────────────── */
/* FIND NEW IDS */
/* ─────────────────────────────────────── */

let archive = "";
try {
  archive = await fetch("https://www.prophecynewswatch.com/archive.cfm");
} catch (e) {
  console.error("❌ Archive fetch failed:", e.message);
}

const ids = [...new Set(
  [...archive.matchAll(/recent_news_id=(\d+)/g)]
    .map(m => Number(m[1]))
    .filter(id => id > lastProcessed)
)].sort((a, b) => a - b);

console.log("📰 New articles found:", ids.length);

if (!ids.length) {
  console.log("ℹ️ Nothing new — exiting cleanly");
}

/* ─────────────────────────────────────── */
/* PROCESS */
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

  let bodyMatch =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]+id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  if (!bodyMatc
