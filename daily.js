/**
 * DOWS6027 – DAILY RUN (DUAL PROCESS, SINGLE PIPELINE)
 * Node 20 – ES Modules – GitHub Actions safe
 */

import fs from "fs";
import path from "path";
import https from "https";
import * as cheerio from "cheerio";
import { generate } from "@pdfme/generator";

/* ─────────────────────────────────────────── */
/* 🔐 STATE FILE                               */
/* ─────────────────────────────────────────── */

const DATA_FILE = "data.json";

const SAFE_BASELINE = {
  last_article_number: 9256,
  last_URL_processed:
    "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  last_run: null
};

function loadState() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(SAFE_BASELINE, null, 2));
    return { ...SAFE_BASELINE };
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    console.warn("⚠ Corrupt data.json — restoring baseline");
    fs.writeFileSync(DATA_FILE, JSON.stringify(SAFE_BASELINE, null, 2));
    return { ...SAFE_BASELINE };
  }
}

function saveState(state) {
  state.last_run = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

/* ─────────────────────────────────────────── */
/* 📁 PATHS                                   */
/* ─────────────────────────────────────────── */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "TMP");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ─────────────────────────────────────────── */
/* 🌐 NETWORK                                  */
/* ─────────────────────────────────────────── */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      })
      .on("error", reject);
  });
}

/* ─────────────────────────────────────────── */
/* 📄 SINGLE ARTICLE PIPELINE                  */
/* ─────────────────────────────────────────── */

async function processArticle(id, state) {
  const url = `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;
  console.log(`➡ Fetching article ${id}`);

  const res = await fetch(url);

  if (res.status === 404) {
    console.log(`⚠ Deleted article ${id} (404)`);
    return false;
  }

  if (res.status !== 200 || !res.body || res.body.length < 500) {
    console.log(`⚠ Invalid/empty article ${id}`);
    return false;
  }

  const $ = cheerio.load(res.body);
  const container = $("#content")
    .find("div")
    .filter((_, el) => $(el).text().length > 500)
    .first();

  if (!container.length) {
    console.log(`⚠ No usable content ${id}`);
    return false;
  }

  const text = container.text().replace(/\s+/g, " ").trim();
  if (!text) return false;

  fs.writeFileSync(path.join(TMP_DIR, `${id}.txt`), text);

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

  const pdfPath = path.join(PDF_DIR, `${id}.pdf`);
  fs.writeFileSync(pdfPath, pdf);

  /* ✅ COMMIT POINT */
  state.last_article_number = id;
  state.last_URL_processed = url;
  saveState(state);

  console.log(`✅ Committed PDF ${id}`);
  return true;
}

/* ─────────────────────────────────────────── */
/* 🔁 PROCESS 1: SEQUENTIAL BACKFILL           */
/* ─────────────────────────────────────────── */

async function sequentialProcess(state) {
  let id = state.last_article_number + 1;

  while (true) {
    const done = await processArticle(id, state);
    if (done) return true;
    id++;
  }
}

/* ─────────────────────────────────────────── */
/* 🔁 PROCESS 2: ARCHIVE DISCOVERY             */
/* ─────────────────────────────────────────── */

async function archiveProcess(state) {
  const archive = await fetch(
    "https://www.prophecynewswatch.com/archive.cfm"
  );

  if (archive.status !== 200) return false;

  const ids = Array.from(
    new Set(
      (archive.body.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter(id => id > state.last_article_number)
    .sort((a, b) => a - b);

  for (const id of ids) {
    const done = await processArticle(id, state);
    if (done) return true;
  }

  return false;
}

/* ─────────────────────────────────────────── */
/* 🚀 MAIN                                    */
/* ─────────────────────────────────────────── */

(async () => {
  console.log("▶ DAILY RUN START");

  const state = loadState();

  /* Always try sequential first */
  const seqDone = await sequentialProcess(state);
  if (seqDone) {
    console.log("▶ DAILY RUN COMPLETE");
    return;
  }

  /* Then archive (yesterday/today safety net) */
  const archDone = await archiveProcess(state);
  if (archDone) {
    console.log("▶ DAILY RUN COMPLETE");
    return;
  }

  console.log("ℹ No new articles to process");
})();
