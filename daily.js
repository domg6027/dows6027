/**
 * DOWS6027 – DAILY RUN (STABLE)
 * PDFME 5.0+
 * Linear, failsafe, forensic
 */

import fs from "fs";
import path from "path";
import https from "https";
import { createPdf } from "@pdfme/common";

/* ---------------- LOG ---------------- */

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* ---------------- PATHS ---------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

if (!fs.existsSync(FONT_PATH)) {
  console.error("❌ Font missing:", FONT_PATH);
  process.exit(1);
}

/* ---------------- STATE ---------------- */

if (!fs.existsSync(STATE_FILE)) {
  console.error("❌ data.json missing");
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
let lastProcessed = Number(state.last_article_number);

if (!Number.isInteger(lastProcessed)) {
  console.error("❌ Invalid last_article_number");
  process.exit(1);
}

/* ---------------- HELPERS ---------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () =>
          res.statusCode === 200
            ? resolve(data)
            : reject(new Error(`HTTP ${res.statusCode}`))
        );
      })
      .on("error", reject);
  });
}

function extractDate(html) {
  const m = html.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/
  );
  if (!m) return null;
  const d = new Date(m[0]);
  return isNaN(d) ? null : d;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- PDF TEMPLATE ---------------- */

const template = {
  basePdf: null,
  schemas: [
    {
      body: {
        type: "text",
        position: { x: 20, y: 20 },
        width: 170,
        height: 260,
        fontSize: 11,
        lineHeight: 1.4
      }
    }
  ]
};

const fonts = {
  Swansea: fs.readFileSync(FONT_PATH)
};

/* ---------------- MAIN ---------------- */

(async () => {
  let archive;

  try {
    archive = await fetch("https://www.prophecynewswatch.com/archive.cfm");
  } catch (e) {
    console.error("❌ Archive fetch failed:", e.message);
    process.exit(1);
  }

  const ids = Array.from(
    new Set(
      (archive.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter(id => id > lastProcessed)
    .sort((a, b) => a - b);

  console.log("📰 Articles discovered:", ids.length);

  let generated = 0;
  let lastAttempted = lastProcessed;

  for (const id of ids) {
    lastAttempted = id;
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      console.warn("⚠ Fetch failed:", id);
      continue;
    }

    const m = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (!m) {
      console.warn("⚠ No <article>:", id);
      continue;
    }

    const articleHtml = m[1];
    const articleDate = extractDate(articleHtml);

    if (!articleDate) {
      console.warn("⚠ No date:", id);
      fs.writeFileSync(
        path.join(TMP_DIR, `NO-DATE-${id}.html`),
        articleHtml
      );
      continue;
    }

    const text = stripHtml(articleHtml);
    if (!text) continue;

    fs.writeFileSync(path.join(TMP_DIR, `${id}.txt`), text, "utf8");

    const ymd =
      articleDate.getUTCFullYear() +
      String(articleDate.getUTCMonth() + 1).padStart(2, "0") +
      String(articleDate.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

    try {
      const pdf = await createPdf({
        template,
        inputs: [{ body: text }],
        options: { font: fonts }
      }).then(r => r.buffer);

      if (!pdf?.length) throw new Error("Empty PDF");

      fs.writeFileSync(pdfPath, pdf);
      console.log("✔ PDF written:", path.basename(pdfPath));
      generated++;
    } catch (e) {
      console.error("❌ PDF failed:", id, e.message);
    }
  }

  /* ---- ALWAYS UPDATE STATE ---- */

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        ...state,
        last_article_number: lastAttempted,
        last_run_utc: new Date().toISOString()
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE");
  console.log("📄 PDFs generated:", generated);
  console.log("🔚 Last article attempted:", lastAttempted);
})();
