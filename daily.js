/**
 * DOWS6027 – DAILY PNW RUN (HARDENED)
 * ES MODULE SAFE – NODE 20 – GITHUB ACTIONS
 * STATE CORRUPTION PROOF
 */

import fs from "fs";
import path from "path";
import https from "https";
import * as cheerio from "cheerio";
import { generate } from "@pdfme/generator";

/* -------------------- HARD BASELINE (LOCKED) -------------------- */

const BASELINE_STATE = {
  last_date_used: "2025-12-11",
  last_URL_processed:
    "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  current_date: "2025-12-11",
  last_article_number: 9256
};

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "TMP");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

if (!fs.existsSync(FONT_PATH)) {
  throw new Error("Missing font: fonts/Swansea-q3pd.ttf");
}

if (!fs.existsSync(BASE_PDF)) {
  throw new Error("Missing base PDF: TEMPLATES/blank.pdf");
}

/* -------------------- LOG START -------------------- */

console.log("▶ DAILY RUN START");
console.log("▶ Baseline article:", BASELINE_STATE.last_article_number);

/* -------------------- NETWORK -------------------- */

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

/* -------------------- MAIN -------------------- */

(async () => {
  let archiveHtml;

  try {
    archiveHtml = await fetch(
      "https://www.prophecynewswatch.com/archive.cfm"
    );
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
    .filter(id => id > BASELINE_STATE.last_article_number)
    .sort((a, b) => a - b);

  console.log("➡ Found", discoveredIds.length, "new articles");

  let generated = 0;
  let highestProcessed = BASELINE_STATE.last_article_number;

  for (const id of discoveredIds) {
    console.log("➡ Processing article", id);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      console.warn("⚠ Missing article:", id);
      continue;
    }

    const $ = cheerio.load(html);

    const container = $("#content")
      .find("div")
      .filter((_, el) => $(el).text().length > 500)
      .first();

    if (!container.length) {
      console.warn("⚠ Skipped (empty):", id);
      continue;
    }

    const text = container
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      console.warn("⚠ Skipped (blank):", id);
      continue;
    }

    fs.writeFileSync(path.join(TMP_DIR, `${id}.txt`), text, "utf8");

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

      fs.writeFileSync(
        path.join(PDF_DIR, `${id}.pdf`),
        pdf
      );

      generated++;
      highestProcessed = id;
      console.log("✔ PDF written:", id);
    } catch (e) {
      console.error("❌ PDF failed:", id, e.message);
    }
  }

  console.log("📄 PDFs generated:", generated);

  if (generated === 0) {
    console.log("ℹ️ No new articles to process");
    process.exit(0);
  }

  console.log("✔ Highest article processed:", highestProcessed);
})();
