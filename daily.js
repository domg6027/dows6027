/**
 * DOWS6027 – DAILY RUN
 * Node 20 / GitHub Actions / ESM SAFE
 * Cheerio 1.1.x compatible
 */

import fs from "fs";
import path from "path";
import https from "https";
import * as cheerio from "cheerio";
import { createPdf } from "@pdfme/common";

/* ---------------- LOG ---------------- */

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* ---------------- PATHS ---------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "TMP");
const STATE_FILE = path.join(ROOT, "data.json");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

if (!fs.existsSync(FONT_PATH)) {
  console.error("❌ Font missing:", FONT_PATH);
  process.exit(1);
}

if (!fs.existsSync(STATE_FILE)) {
  console.error("❌ data.json missing");
  process.exit(1);
}

/* ---------------- STATE ---------------- */

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
let lastProcessed = Number(state.last_article_number);

if (!Number.isInteger(lastProcessed)) {
  console.error("❌ Invalid last_article_number");
  process.exit(1);
}

/* ---------------- NETWORK ---------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => {
          res.statusCode === 200
            ? resolve(data)
            : reject(new Error(`HTTP ${res.statusCode}`));
        });
      })
      .on("error", reject);
  });
}

/* ---------------- ARTICLE EXTRACT ---------------- */

function extractArticleText(html) {
  const $ = cheerio.load(html);

  const selectors = [
    "article",
    "#content article",
    "#content",
    ".entry_content",
    ".post-content"
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    const text = el.text().replace(/\s+/g, " ").trim();
    if (text.length > 500) return text;
  }

  return null;
}

/* ---------------- MAIN ---------------- */

(async () => {
  let archiveHtml;

  try {
    archiveHtml = await fetch("https://www.prophecynewswatch.com/archive.cfm");
  } catch (e) {
    console.error("❌ Failed to fetch archive:", e.message);
    process.exit(1);
  }

  const discoveredIds = Array.from(
    new Set(
      (archiveHtml.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter(id => id > lastProcessed)
    .sort((a, b) => a - b);

  console.log("📰 Articles discovered:", discoveredIds.length);

  let generated = 0;
  let lastAttempted = lastProcessed;

  for (const id of discoveredIds) {
    lastAttempted = id;
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      console.warn("⚠ Article missing:", id);
      continue;
    }

    const text = extractArticleText(html);

    if (!text) {
      console.warn("⚠ No article body:", id);
      continue;
    }

    fs.writeFileSync(path.join(TMP_DIR, `${id}.txt`), text, "utf8");

    let pdf;
    try {
      pdf = (
        await createPdf({
          template: {
            schemas: [
              {
                body: {
                  type: "text",
                  position: { x: 20, y: 20 },
                  width: 170,
                  height: 260,
                  fontSize: 11
                }
              }
            ]
          },
          inputs: [{ body: text }],
          options: {
            font: {
              Swansea: fs.readFileSync(FONT_PATH)
            }
          }
        })
      ).buffer;
    } catch (e) {
      console.error("❌ PDF failed:", id, e.message);
      continue;
    }

    fs.writeFileSync(path.join(PDF_DIR, `${id}.pdf`), pdf);
    console.log("✔ PDF written:", `${id}.pdf`);
    generated++;
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        ...state,
        last_article_number: lastAttempted,
        last_run_utc: new Date().toISOString()
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE");
  console.log("📄 PDFs generated:", generated);
  console.log("🔚 Last article attempted:", lastAttempted);

  if (generated === 0) {
    console.error("❌ No PDFs generated");
    process.exit(1);
  }
})();
