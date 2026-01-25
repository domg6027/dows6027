/**
 * onepdf.js
 * Processes EXACTLY ONE REAL PNW ARTICLE
 * Loops ONLY to skip 404 / 302 article numbers
 * Atomic: PDF → verify → update data.json → git commit
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import * as cheerio from "cheerio";
import { generate } from "@pdfme/generator";

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "data.json");
const PDF_DIR = path.join(ROOT, "PDFS");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

fs.mkdirSync(PDF_DIR, { recursive: true });

/* -------------------- GUARDS -------------------- */

if (!fs.existsSync(DATA_FILE)) throw new Error("Missing data.json");
if (!fs.existsSync(FONT_PATH)) throw new Error("Missing font file");
if (!fs.existsSync(BASE_PDF)) throw new Error("Missing blank.pdf");

/* -------------------- FETCH -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else if (res.statusCode === 404 || res.statusCode === 302) {
            const err = new Error(`HTTP ${res.statusCode}`);
            err.skip = true;
            reject(err);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      })
      .on("error", reject);
  });
}

/* -------------------- MAIN -------------------- */

(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let articleId = state.last_article_number + 1;

  while (true) {
    console.log("➡ Trying article", articleId);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${articleId}`
      );
    } catch (e) {
      if (e.skip) {
        console.warn(`⚠ Article ${articleId} missing (${e.message}) – trying next`);
        articleId++;
        continue; // ✅ ONLY LOOP CONDITION
      }
      console.error("❌ Network error:", e.message);
      process.exit(1);
    }

    /* -------- REAL ARTICLE FOUND -------- */

    const $ = cheerio.load(html);

    // Full body, ads included (as requested)
    const text = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 500) {
      console.error(`❌ Article ${articleId} has no usable content`);
      process.exit(1);
    }

    const pdfPath = path.join(PDF_DIR, `${articleId}.pdf`);

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

      fs.writeFileSync(pdfPath, pdf);
    } catch (e) {
      console.error(`❌ PDF generation failed for ${articleId}:`, e.message);
      process.exit(1);
    }

    if (!fs.existsSync(pdfPath)) {
      console.error("❌ PDF missing after generation");
      process.exit(1);
    }

    /* -------- ATOMIC STATE UPDATE -------- */

    const newState = {
      ...state,
      last_article_number: articleId,
      last_URL_processed:
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${articleId}`
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(newState, null, 2));

    /* -------- COMMIT -------- */

    execSync(`git add "${pdfPath}" data.json`, { stdio: "inherit" });
    execSync(`git commit -m "Add PNW article ${articleId}"`, {
      stdio: "inherit"
    });

    console.log(`✔ Article ${articleId} committed`);
    process.exit(0); // 🚨 EXIT AFTER ONE SUCCESS
  }
})();
