/**
 * DOWS6027 – DAILY / CATCH-UP RUNNER
 * Node-only, PDFME-only
 * Auto-selects mode based on data.json age
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import pkg from "@pdfme/common";

const { text } = pkg;

/* -------------------- BOOT -------------------- */

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

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

const lastId = Number(state.last_article_number);
const lastDate = new Date(state.last_date_used);

if (!Number.isInteger(lastId) || lastId <= 0 || isNaN(lastDate)) {
  console.error("❌ Invalid state fields — refusing to run");
  process.exit(1);
}

/* -------------------- MODE DECISION -------------------- */

const DAYS = Math.floor(
  (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
);

const MODE = DAYS > 7 ? "CATCHUP" : "DAILY";

console.log(`ℹ Mode selected: ${MODE} (${DAYS} days gap)`);

/* -------------------- HTTP -------------------- */

function fetchPage(url) {
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

/* -------------------- ARTICLE → PDF -------------------- */

async function processArticle(id) {
  let html;
  try {
    html = await fetchPage(
      `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
    );
  } catch {
    return false;
  }

  let body = null;

  const a1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const a2 = html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);

  if (a1) body = a1[1];
  if (!body && a2) body = a2[1];
  if (!body || body.length < 200) return false;

  const clean = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length < 300) return false;

  const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
  const d = dateMatch ? new Date(dateMatch[1]) : new Date();

  const ymd =
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0");

  const pdfPath = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

  const template = {
    basePdf: null,
    schemas: [
      {
        content: {
          type: "text",
          position: { x: 20, y: 20 },
          width: 170,
          height: 260,
          fontSize: 11
        }
      }
    ]
  };

  try {
    const pdf = await generate({
      template,
      inputs: [{ content: clean }]
    });
    fs.writeFileSync(pdfPath, pdf);
    return true;
  } catch {
    return false;
  }
}

/* -------------------- MAIN -------------------- */

(async function main() {
  let ids = [];

  if (MODE === "DAILY") {
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
  } else {
    for (let i = lastId + 1; i <= lastId + 2000; i++) {
      ids.push(i);
    }
  }

  if (ids.length === 0) {
    console.log("ℹ No new articles — exiting cleanly");
    return;
  }

  console.log("📰 Articles to process:", ids.length);

  let generated = 0;
  let highestId = lastId;
  let misses = 0;

  for (const id of ids) {
    console.log("➡ Processing", id);
    const ok = await processArticle(id);

    if (ok) {
      generated++;
      highestId = id;
      misses = 0;
    } else {
      misses++;
    }

    if (MODE === "CATCHUP" && misses >= 20) break;
  }

  if (generated === 0) {
    console.error("❌ NO PDFs GENERATED — exiting without state update");
    process.exit(1);
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        last_date_used: new Date().toISOString().slice(0, 10),
        current_date: new Date().toISOString().slice(0, 10),
        last_URL_processed:
          `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${highestId}`,
        last_article_number: highestId
      },
      null,
      2
    )
  );

  console.log(`✔ COMPLETE — PDFs generated: ${generated}`);
})();
