/**
 * DOWS6027 – DAILY PDF GENERATOR (FINAL, STABLE)
 * Node.js + PDFME only
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import pkg from "@pdfme/common";

const { createBlankPdf } = pkg;

/* -------------------- START -------------------- */

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* -------------------- STATE LOAD -------------------- */

if (!fs.existsSync(STATE_FILE)) {
  console.error("❌ data.json missing — refusing to run");
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
} catch {
  console.error("❌ data.json invalid JSON — refusing to run");
  process.exit(1);
}

const lastId = Number(state.last_article_number);
if (!Number.isInteger(lastId) || lastId < 9000) {
  console.error("❌ INVALID last_article_number — refusing to run");
  process.exit(1);
}

/* -------------------- MODE DECISION -------------------- */

const lastDate = new Date(state.last_date_used);
const today = new Date();
const gapDays = Math.floor((today - lastDate) / 86400000);

const MODE = gapDays > 7 ? "CATCHUP" : "SCRAPE";
console.log(`ℹ Mode selected: ${MODE} (${gapDays} days gap)`);

/* -------------------- HTTP -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      }
    );
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

/* -------------------- ARTICLE LIST -------------------- */

async function getArticleIds() {
  if (MODE === "CATCHUP") {
    const max = lastId + 2000;
    return Array.from({ length: max - lastId }, (_, i) => lastId + i + 1);
  }

  const archive = await fetch("https://www.prophecynewswatch.com/archive.cfm");
  return Array.from(
    new Set(
      (archive.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter(id => id > lastId)
    .sort((a, b) => a - b);
}

/* -------------------- MAIN -------------------- */

(async () => {
  const ids = await getArticleIds();
  console.log("📰 Articles to process:", ids.length);

  const fontBuffer = fs.readFileSync(FONT_PATH);

  const basePdf = await createBlankPdf({
    size: "A4",
    fonts: {
      Swansea: {
        data: fontBuffer,
        fallback: true
      }
    }
  });

  let generated = 0;
  let lastSuccess = lastId;

  for (const id of ids) {
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      continue;
    }

    let body =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
      html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i)?.[1];

    if (!body) continue;

    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 400) continue;

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();
    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const template = {
      basePdf,
      schemas: [
        {
          article: {
            type: "text",
            position: { x: 15, y: 20 },
            width: 180,
            height: 257,
            fontSize: 11,
            lineHeight: 1.4,
            fontName: "Swansea",
            wrap: true
          }
        }
      ]
    };

    try {
      const pdf = await generate({
        template,
        inputs: [{ article: text }]
      });

      fs.writeFileSync(
        path.join(PDF_DIR, `${ymd}-${id}.pdf`),
        pdf
      );

      generated++;
      lastSuccess = id;
    } catch (e) {
      console.error("❌ PDF generation failed for", id);
    }
  }

  if (generated === 0) {
    console.error("❌ NO PDFs GENERATED — exiting without state update");
    process.exit(1);
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        last_date_used: today.toISOString().slice(0, 10),
        current_date: today.toISOString().slice(0, 10),
        last_URL_processed:
          `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${lastSuccess}`,
        last_article_number: lastSuccess
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE — PDFs:", generated);
})();
