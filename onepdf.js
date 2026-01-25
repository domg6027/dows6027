/**
 * onepdf.js
 * Produce EXACTLY ONE PDF safely.
 * Advances data.json ONLY after PDF exists.
 */

import fs from "fs";
import path from "path";
import https from "https";
import * as cheerio from "cheerio";
import { generate } from "@pdfme/generator";

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "data.json");
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "TMP");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

const PNW_TEMPLATES = [
  path.join(ROOT, "TEMPLATES", "PNW1.txt"),
  path.join(ROOT, "TEMPLATES", "PNW2.txt"),
  path.join(ROOT, "TEMPLATES", "PNW3.txt"),
];

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* -------------------- GUARDS -------------------- */

for (const p of [DATA_FILE, FONT_PATH, BASE_PDF]) {
  if (!fs.existsSync(p)) throw new Error(`Missing required file: ${p}`);
}

for (const t of PNW_TEMPLATES) {
  if (!fs.existsSync(t)) throw new Error(`Missing PNW template: ${t}`);
}

/* -------------------- HELPERS -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(data);
          }
        });
      })
      .on("error", reject);
  });
}

function extractTextWithTemplates(html) {
  for (const tplPath of PNW_TEMPLATES) {
    const selector = fs.readFileSync(tplPath, "utf8").trim();
    if (!selector) continue;

    const $ = cheerio.load(html);
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().replace(/\s+/g, " ").trim();
      if (text.length > 500) return text;
    }
  }
  return null;
}

/* -------------------- MAIN -------------------- */

(async () => {
  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  let article = state.last_article_number + 1;
  const url = `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${article}`;

  console.log("➡ Trying article", article);

  let html;
  try {
    html = await fetch(url);
  } catch {
    console.log("⚠ 404 or fetch error, skipping:", article);

    state.last_article_number = article;
    state.last_URL_processed = url;
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

    return;
  }

  const text = extractTextWithTemplates(html);

  if (!text) {
    console.log("⚠ No article body detected, skipping:", article);

    state.last_article_number = article;
    state.last_URL_processed = url;
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

    return;
  }

  const pdfPath = path.join(PDF_DIR, `${article}.pdf`);

  try {
    const pdf = await generate({
      template: {
        basePdf: fs.readFileSync(BASE_PDF),
        schemas: [
          {
            body: {
              type: "text",
              position: { x: 20, y: 20 },
              width: 170,
              height: 260,
              fontSize: 11,
            },
          },
        ],
      },
      inputs: [{ body: text }],
      options: {
        font: {
          Swansea: {
            data: fs.readFileSync(FONT_PATH),
            fallback: true,
          },
        },
      },
    });

    fs.writeFileSync(pdfPath, pdf);
  } catch (e) {
    console.error("❌ PDF generation failed:", e.message);
    return;
  }

  /* ---------- VERIFY BEFORE STATE ADVANCE ---------- */

  if (!fs.existsSync(pdfPath)) {
    console.error("❌ PDF not written, state NOT updated");
    return;
  }

  /* ---------- SAFE STATE UPDATE ---------- */

  state.last_article_number = article;
  state.last_URL_processed = url;
  state.last_date_used = new Date().toISOString().slice(0, 10);
  state.current_date = state.last_date_used;

  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

  console.log(`✔ Committed PDF ${article}`);
})();
