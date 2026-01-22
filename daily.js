/**
 * DOWS6027 – DAILY RUN (CHEERIO + PDFME 5.x)
 * ONLINE / GITHUB ACTIONS SAFE
 * NON-DESTRUCTIVE, FORENSIC, FAIL-SAFE
 */

import fs from "fs";
import path from "path";
import https from "https";
import { load } from "cheerio"; // <-- Fixed ESM import
import pdfme from "@pdfme/common";

const { createPdf } = pdfme;

/* ---------------- LOG START ---------------- */

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* ---------------- PATHS ---------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "TMP");
const STATE_FILE = path.join(ROOT, "data.json");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

if (!fs.existsSync(FONT_PATH)) {
  console.error("❌ Font missing:", FONT_PATH);
  process.exit(1);
}

if (!fs.existsSync(STATE_FILE)) {
  console.error("❌ data.json missing");
  process.exit(1);
}

/* ---------------- STATE ---------------- */

let state;
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
} catch (e) {
  console.error("❌ Failed to read state:", e.message);
  process.exit(1);
}

let lastProcessed = Number(state.last_article_number);
if (!Number.isInteger(lastProcessed)) {
  console.error("❌ Invalid last_article_number");
  process.exit(1);
}

/* ---------------- NETWORK ---------------- */

function fetch(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(data);
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(timeout, () => {
      req.destroy(new Error("Request timed out"));
    });
  });
}

/* ---------------- FONT PRELOAD ---------------- */

let fontBuffer;
try {
  fontBuffer = fs.readFileSync(FONT_PATH);
} catch (e) {
  console.error("❌ Failed to read font:", e.message);
  process.exit(1);
}

/* ---------------- MAIN ---------------- */

(async () => {
  let archiveHtml;
  try {
    archiveHtml = await fetch("https://www.prophecynewswatch.com/archive.cfm");
  } catch (e) {
    console.error("❌ Failed to fetch archive:", e.message);
    process.exit(1);
  }

  const discoveredIds = Array.from(
    new Set(
      (archiveHtml.match(/recent_news_id=\d+/g) || []).map((x) =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter((id) => id > lastProcessed)
    .sort((a, b) => a - b);

  console.log("📰 Articles discovered:", discoveredIds.length);

  let generated = 0;
  let lastAttempted = lastProcessed;

  for (const id of discoveredIds) {
    lastAttempted = id;
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      console.warn("⚠ Article missing (skipped):", id);
      continue;
    }

    const $ = load(html);
    const articleContainer = $("#content")
      .find("div")
      .filter((_, el) => $(el).text().length > 500)
      .first();

    if (!articleContainer.length) {
      console.warn("⚠ No article body:", id);
      continue;
    }

    const text = articleContainer.text().replace(/\s+/g, " ").trim();
    if (!text) {
      console.warn("⚠ Empty article text:", id);
      continue;
    }

    /* ---- FORENSIC RAW SAVE ---- */
    try {
      fs.writeFileSync(path.join(TMP_DIR, `${id}.txt`), text, "utf8");
    } catch (e) {
      console.error("❌ Failed to write raw text:", e.message);
      continue;
    }

    /* ---- PDF ---- */
    const pdfPath = path.join(PDF_DIR, `${id}.pdf`);
    let pdf;
    try {
      pdf = await createPdf({
        template: {
          schemas: [
            {
              body: {
                type: "text",
                position: { x: 20, y: 20 },
                width: 170,
                height: 260,
                fontSize: 11,
              },
            },
          ],
        },
        inputs: [{ body: text }],
        options: {
          font: { Swansea: fontBuffer },
        },
      }).then((res) => res.buffer);
    } catch (e) {
      console.error("❌ PDF generation failed:", id, e.message);
      continue;
    }

    if (!pdf || !pdf.length) {
      console.error("❌ Empty PDF buffer:", id);
      continue;
    }

    try {
      fs.writeFileSync(pdfPath, pdf);
      console.log("✔ PDF written:", path.basename(pdfPath));
      generated++;
    } catch (e) {
      console.error("❌ Failed to write PDF:", e.message);
    }
  }

  /* ---------------- STATE WRITE ---------------- */
  try {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          ...state,
          last_article_number: lastAttempted,
          last_run_utc: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch (e) {
    console.error("❌ Failed to write state file:", e.message);
  }

  console.log("✔ DAILY RUN COMPLETE");
  console.log("📄 PDFs generated:", generated);
  console.log("🔚 Last article attempted:", lastAttempted);
})();
