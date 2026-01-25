/**
 * DOWS6027 – ONE PDF GENERATOR (AUTHORITATIVE)
 * Produces EXACTLY ONE PDF per run
 * State-safe, restart-safe
 * Node 20 – ES Module
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
const TEMPLATES_DIR = path.join(ROOT, "TEMPLATES");

const BASE_PDF = path.join(TEMPLATES_DIR, "blank.pdf");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

/* -------------------- GUARDS -------------------- */

if (!fs.existsSync(DATA_FILE)) {
  throw new Error("Missing data.json");
}
if (!fs.existsSync(BASE_PDF)) {
  throw new Error("Missing TEMPLATES/blank.pdf");
}
if (!fs.existsSync(FONT_PATH)) {
  throw new Error("Missing font Swansea-q3pd.ttf");
}

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* -------------------- NETWORK -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: { "User-Agent": "Mozilla/5.0" } },
        res => {
          let data = "";
          res.on("data", d => (data += d));
          res.on("end", () => {
            if (res.statusCode === 404) {
              reject(new Error("404"));
            } else if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}`));
            } else {
              resolve(data);
            }
          });
        }
      )
      .on("error", reject);
  });
}

/* -------------------- TEMPLATE LOAD -------------------- */

function loadPNWTemplates() {
  return fs
    .readdirSync(TEMPLATES_DIR)
    .filter(f => /^PNW\d+\.txt$/i.test(f))
    .map(f => fs.readFileSync(path.join(TEMPLATES_DIR, f), "utf8"));
}

/* -------------------- MAIN -------------------- */

(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let articleId = state.last_article_number + 1;

  console.log("➡ Trying article", articleId);

  let html;
  try {
    html = await fetch(
      `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${articleId}`
    );
  } catch (e) {
    if (e.message === "404") {
      console.warn("⚠ Article 404 – skipped:", articleId);
      state.last_article_number = articleId;
      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
      console.log("✔ data.json updated (404 skip)");
      process.exit(0);
    }
    throw e;
  }

  /* ---- Load and match templates ---- */

  const templates = loadPNWTemplates();
  let extractedHTML = null;

  for (const tpl of templates) {
    if (html.includes(tpl.trim().slice(0, 200))) {
      const $ = cheerio.load(html);
      extractedHTML = $("body").html();
      break;
    }
  }

  if (!extractedHTML) {
    // LAST RESORT: take full body anyway
    const $ = cheerio.load(html);
    extractedHTML = $("body").html();
  }

  if (!extractedHTML) {
    throw new Error(`No HTML extracted for ${articleId}`);
  }

  const text = cheerio
    .load(extractedHTML)
    .text()
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    throw new Error(`Extracted text empty for ${articleId}`);
  }

  /* ---- Generate PDF ---- */

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
            fontSize: 11
          }
        }
      ]
    },
    inputs: [{ body: text }],
    options: {
      font: {
        Swansea: {
          data: fs.readFileSync(FONT_PATH),
          fallback: true
        }
      }
    }
  });

  const pdfPath = path.join(PDF_DIR, `${articleId}.pdf`);
  fs.writeFileSync(pdfPath, pdf);

  if (!fs.existsSync(pdfPath)) {
    throw new Error("PDF generation failed silently");
  }

  /* ---- Commit state ONLY AFTER PDF EXISTS ---- */

  state.last_article_number = articleId;
  state.last_URL_processed =
    `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${articleId}`;

  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

  console.log(`✔ Committed PDF ${articleId}`);
})();
