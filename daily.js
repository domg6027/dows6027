/**
 * DOWS6027 – DAILY RUN (Node-only, PDFME)
 * FINAL HARDENED VERSION
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import common from "@pdfme/common";

const { createPdf } = common;

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* -------------------- PATHS -------------------- */

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
  console.error("❌ data.json invalid — refusing to run");
  process.exit(1);
}

const lastProcessed = Number(state.last_article_number);
if (!Number.isInteger(lastProcessed) || lastProcessed <= 0) {
  console.error("❌ INVALID last_article_number — refusing to run");
  process.exit(1);
}

/* -------------------- DATE HELPERS -------------------- */

const todayUTC = new Date();
todayUTC.setUTCHours(0, 0, 0, 0);

const yesterdayUTC = new Date(todayUTC);
yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);

const threeDaysAgoUTC = new Date(todayUTC);
threeDaysAgoUTC.setUTCDate(threeDaysAgoUTC.getUTCDate() - 3);

/* -------------------- HTTP -------------------- */

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

/* -------------------- ARTICLE DATE (STRICT) -------------------- */

function extractArticleDate(articleHtml) {
  const m =
    articleHtml.match(/class="article-date"[^>]*>([^<]+)/i) ||
    articleHtml.match(/<span class="date">([^<]+)/i);

  if (!m) return null;

  const d = new Date(m[1].trim());
  return isNaN(d) ? null : d;
}

/* -------------------- MAIN -------------------- */

(async function main() {
  const archive = await fetchPage(
    "https://www.prophecynewswatch.com/archive.cfm"
  );

  const ids = Array.from(
    new Set(
      (archive.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter(id => id > lastProcessed)
    .sort((a, b) => a - b);

  let mode = "CATCHUP";
  const gapDays = Math.floor(
    (todayUTC - new Date(state.last_date_used || todayUTC)) /
      (1000 * 60 * 60 * 24)
  );

  if (gapDays <= 7) mode = "SCRAPE";

  console.log(`ℹ Mode selected: ${mode}`);
  console.log("📰 Articles to process:", ids.length);

  let generated = 0;
  let currentLast = lastProcessed;

  for (const id of ids) {
    console.log("➡ Processing", id);

    const html = await fetchPage(
      `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
    );

    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (!articleMatch) continue;

    const articleHtml = articleMatch[1];
    const articleDate = extractArticleDate(articleHtml);

    if (!articleDate) continue;

    articleDate.setUTCHours(0, 0, 0, 0);

    if (mode === "CATCHUP" && articleDate >= yesterdayUTC) {
      console.log("🔁 Reached yesterday — switching to SCRAPE");
      mode = "SCRAPE";
      continue;
    }

    if (mode === "SCRAPE" && articleDate < threeDaysAgoUTC) continue;

    const cleanText = articleHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanText.length < 300) continue;

    const ymd =
      articleDate.getUTCFullYear().toString() +
      String(articleDate.getUTCMonth() + 1).padStart(2, "0") +
      String(articleDate.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

    const pdf = await createPdf({
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
      inputs: [{ body: cleanText }],
      options: {
        font: {
          Swansea: fs.readFileSync(FONT_PATH)
        }
      }
    });

    fs.writeFileSync(pdfPath, pdf);
    generated++;
    currentLast = id;
  }

  if (generated === 0) {
    console.log("ℹ No PDFs generated — exiting cleanly");
    return;
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        ...state,
        last_article_number: currentLast,
        last_date_used: todayUTC.toISOString().slice(0, 10),
        last_URL_processed:
          "https://www.prophecynewswatch.com/article.cfm?recent_news_id=" +
          currentLast
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE — PDFs:", generated);
})();
