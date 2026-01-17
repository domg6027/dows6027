/**
 * DOWS6027 – DAILY RUN (PDFME, NODE-ONLY)
 * HARD-SAFE / NO REWIND / ONE ARTICLE PER PDF
 */

import fs from "fs";
import path from "path";
import https from "https";

import { generate } from "@pdfme/generator";
import pkg from "@pdfme/common";
const { fonts } = pkg;

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

const MIN_VALID_ID = 9000;

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* -------------------- HARD STATE GUARD -------------------- */

if (!fs.existsSync(STATE_FILE)) {
  console.error("❌ data.json missing — aborting");
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
} catch {
  console.error("❌ data.json corrupt — aborting");
  process.exit(1);
}

if (
  typeof state.lastProcessed !== "number" ||
  !Number.isInteger(state.lastProcessed) ||
  state.lastProcessed < MIN_VALID_ID
) {
  console.error(
    `❌ INVALID lastProcessed (${state.lastProcessed}) — REFUSING TO RUN`
  );
  process.exit(1);
}

let lastProcessed = state.lastProcessed;

/* -------------------- DIRECTORIES -------------------- */

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* -------------------- FETCH HELPERS -------------------- */

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
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/* -------------------- CONTENT EXTRACT -------------------- */

function extractArticle(html) {
  const m1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const m2 = html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);
  const raw = m1 ? m1[1] : m2 ? m2[1] : null;
  if (!raw) return null;

  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------- MAIN -------------------- */

(async function main() {
  let archive;
  try {
    archive = await fetchPage(
      "https://www.prophecynewswatch.com/archive.cfm"
    );
  } catch {
    console.error("❌ Failed to fetch archive");
    process.exit(1);
  }

  const ids = (archive.match(/recent_news_id=\d+/g) || [])
    .map(x => Number(x.replace("recent_news_id=", "")))
    .filter(id => id > lastProcessed)
    .sort((a, b) => a - b);

  console.log("📰 New articles found:", ids.length);

  let generated = 0;

  for (const id of ids) {
    if (id <= lastProcessed) continue; // HARD NO-REWIND

    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetchPage(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      console.warn("⚠ Fetch failed:", id);
      lastProcessed = id;
      continue;
    }

    const text = extractArticle(html);
    if (!text || text.length < 200) {
      console.warn("⚠ Empty / short article:", id);
      lastProcessed = id;
      continue;
    }

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();

    const ymd =
      d.getUTCFullYear() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

    const template = {
      schemas: [
        {
          body: {
            type: "text",
            position: { x: 10, y: 10 },
            width: 190,
            height: 277,
            fontSize: 11,
            lineHeight: 1.4
          }
        }
      ]
    };

    const inputs = [{ body: text }];

    try {
      const pdf = await generate({
        template,
        inputs,
        options: { font: fonts.Helvetica }
      });
      fs.writeFileSync(pdfPath, pdf);
      generated++;
    } catch (e) {
      console.error("❌ PDF generation failed:", id);
    }

    lastProcessed = id;
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        lastProcessed,
        updated_utc: new Date().toISOString()
      },
      null,
      2
    )
  );

  console.log(`✔ DAILY RUN COMPLETE — PDFs generated: ${generated}`);
})();
