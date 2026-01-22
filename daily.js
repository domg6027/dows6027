/**
 * DOWS6027 – DAILY RUN
 * Node-only, PDFME
 * FINAL STABLE LOGIC
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import pdfmeCommon from "@pdfme/common";

const { text } = pdfmeCommon;

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* -------------------- LOAD STATE -------------------- */

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
const lastDateUsed = new Date(state.last_date_used + "T00:00:00Z");

if (!Number.isInteger(lastId) || lastId <= 0) {
  console.error("❌ Invalid last_article_number — refusing to run");
  process.exit(1);
}

/* -------------------- DATE HELPERS -------------------- */

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

const yesterday = new Date(today);
yesterday.setUTCDate(today.getUTCDate() - 1);

const threeDaysAgo = new Date(today);
threeDaysAgo.setUTCDate(today.getUTCDate() - 2);

const gapDays = Math.floor((today - lastDateUsed) / 86400000);

/* -------------------- MODE DECISION -------------------- */

let mode = gapDays > 7 ? "CATCHUP" : "SCRAPE";
console.log(`ℹ Mode selected: ${mode} (${gapDays} days gap)`);

/* -------------------- FETCH -------------------- */

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

/* -------------------- EXTRACT DATE -------------------- */

function extractDate(html) {
  const m = html.match(/(\w+ \d{1,2}, \d{4})/);
  if (!m) return null;
  const d = new Date(m[1] + " UTC");
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/* -------------------- MAIN -------------------- */

(async function main() {
  let archive;
  try {
    archive = await fetchPage("https://www.prophecynewswatch.com/archive.cfm");
  } catch {
    console.error("❌ Failed to fetch archive");
    process.exit(1);
  }

  const allIds = Array.from(
    new Set(
      (archive.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  ).sort((a, b) => a - b);

  let ids;

  if (mode === "CATCHUP") {
    ids = allIds.filter(id => id > lastId);
  } else {
    ids = allIds.slice(-200); // recent window safety
  }

  console.log("📰 Articles to process:", ids.length);

  let generated = 0;
  let highestWritten = lastId;

  for (const id of ids) {
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetchPage(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      continue;
    }

    const articleDate = extractDate(html);
    if (!articleDate) continue;

    /* ---- MODE TRANSITION RULE ---- */
    if (mode === "CATCHUP" && articleDate >= yesterday) {
      console.log("🔁 Reached yesterday — switching to SCRAPE");
      break;
    }

    if (mode === "SCRAPE" && articleDate < threeDaysAgo) {
      continue;
    }

    /* ---- CONTENT EXTRACTION ---- */

    const a1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const a2 = html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);
    const body = a1?.[1] || a2?.[1];

    if (!body || body.length < 300) continue;

    const cleanText = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanText.length < 500) continue;

    const ymd =
      articleDate.getUTCFullYear().toString() +
      String(articleDate.getUTCMonth() + 1).padStart(2, "0") +
      String(articleDate.getUTCDate()).padStart(2, "0");

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
        inputs: [{ content: cleanText }]
      });
      fs.writeFileSync(pdfPath, pdf);
      generated++;
      highestWritten = id;
    } catch {
      continue;
    }
  }

  if (generated === 0) {
    console.error("❌ NO PDFs GENERATED — exiting without state update");
    process.exit(1);
  }

  /* -------------------- STATE UPDATE -------------------- */

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        last_date_used: state.last_date_used,
        current_date: today.toISOString().slice(0, 10),
        last_URL_processed:
          `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${highestWritten}`,
        last_article_number: highestWritten
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE — PDFs:", generated);
})();
