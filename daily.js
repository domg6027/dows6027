/**
 * DOWS6027 – DAILY / CATCH-UP RUN
 * Node-only • PDFME • Swansea font
 * HARD FAIL SAFE
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import pdfme from "@pdfme/common";

const { createBlankPdf } = pdfme;

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ---------------- STATE LOAD ---------------- */

if (!fs.existsSync(STATE_FILE)) {
  console.error("❌ data.json missing");
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

const lastId = Number(state.last_article_number);
const lastDate = new Date(state.last_date_used);

if (!Number.isInteger(lastId) || lastId <= 0) {
  console.error("❌ INVALID last_article_number");
  process.exit(1);
}

const daysGap = Math.floor(
  (Date.now() - lastDate.getTime()) / 86400000
);

const MODE = daysGap > 7 ? "CATCHUP" : "DAILY";
console.log(`ℹ Mode selected: ${MODE} (${daysGap} days gap)`);

/* ---------------- FONT ---------------- */

if (!fs.existsSync(FONT_PATH)) {
  console.error("❌ Swansea font missing:", FONT_PATH);
  process.exit(1);
}

const fonts = {
  Swansea: fs.readFileSync(FONT_PATH)
};

/* ---------------- HTTP ---------------- */

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      })
      .on("error", reject)
      .setTimeout(20000, function () {
        this.destroy(new Error("timeout"));
      });
  });
}

/* ---------------- MAIN ---------------- */

(async () => {
  let ids = [];

  if (MODE === "CATCHUP") {
    // Conservative cap to prevent runaway
    for (let i = lastId + 1; i <= lastId + 2000; i++) ids.push(i);
  } else {
    const archive = await fetchPage(
      "https://www.prophecynewswatch.com/archive.cfm"
    );

    ids = Array.from(
      new Set(
        (archive.match(/recent_news_id=\d+/g) || []).map(x =>
          Number(x.replace("recent_news_id=", ""))
        )
      )
    )
      .filter(id => id > lastId)
      .sort((a, b) => a - b);
  }

  console.log("📰 Articles to process:", ids.length);

  let generated = 0;
  let currentLast = lastId;

  for (const id of ids) {
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetchPage(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      break; // stop on gap
    }

    const match =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);

    if (!match) break;

    const text = match[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 500) break;

    const basePdf = createBlankPdf({ width: 210, height: 297 });

    const template = {
      basePdf,
      schemas: [
        {
          body: {
            type: "text",
            position: { x: 20, y: 20 },
            width: 170,
            height: 257,
            fontSize: 11,
            fontName: "Swansea"
          }
        }
      ]
    };

    try {
      const pdf = await generate({
        template,
        inputs: [{ body: text }],
        options: { font: fonts }
      });

      const out = path.join(PDF_DIR, `${id}.pdf`);
      fs.writeFileSync(out, pdf);

      generated++;
      currentLast = id;
    } catch (e) {
      console.error("❌ PDF FAILED:", id);
      break;
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
        ...state,
        current_date: new Date().toISOString().slice(0, 10),
        last_article_number: currentLast,
        last_URL_processed:
          `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${currentLast}`
      },
      null,
      2
    )
  );

  console.log(`✔ COMPLETE — PDFs generated: ${generated}`);
})();
