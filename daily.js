/**
 * DOWS6027 – DAILY RUN
 * Node.js 20 / PDFME ONLY
 * FINAL HARDENED VERSION
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import pdfmeCommon from "@pdfme/common";

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* ---------------- STATE LOAD (STRICT) ---------------- */

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

const lastProcessed = Number(state.last_article_number);

if (!Number.isInteger(lastProcessed) || lastProcessed <= 0) {
  console.error("❌ INVALID last_article_number — refusing to run");
  process.exit(1);
}

/* ---------------- HTTP FETCH ---------------- */

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

/* ---------------- MAIN ---------------- */

(async function main() {
  let archiveHtml;
  try {
    archiveHtml = await fetchPage("https://www.prophecynewswatch.com/archive.cfm");
  } catch {
    console.error("❌ Failed to fetch archive");
    process.exit(1);
  }

  const ids = Array.from(
    new Set(
      (archiveHtml.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter(id => id > lastProcessed)
    .sort((a, b) => a - b);

  console.log("📰 New articles found:", ids.length);

  let generated = 0;
  let currentLast = lastProcessed;

  for (const id of ids) {
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetchPage(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      currentLast = id;
      continue;
    }

    /* -------- BODY EXTRACTION (BOTH FORMATS) -------- */

    let body = null;

    const m1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const m2 = html.match(
      /class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i
    );

    if (m1) body = m1[1];
    if (!body && m2) body = m2[1];

    if (!body || body.trim().length < 200) {
      fs.writeFileSync(path.join(TMP_DIR, `FAIL-${id}.html`), html);
      currentLast = id;
      continue;
    }

    const cleanText = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanText.length < 300) {
      currentLast = id;
      continue;
    }

    /* -------- DATE -------- */

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();

    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

    /* -------- PDF TEMPLATE -------- */

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

    const inputs = [{ content: cleanText }];

    try {
      const pdf = await generate({ template, inputs });
      fs.writeFileSync(pdfPath, Buffer.from(pdf.buffer));
      generated++;
    } catch (e) {
      console.error("❌ PDF generation failed for", id);
    }

    currentLast = id;
  }

  if (generated === 0) {
    console.error("❌ NO PDFs GENERATED — HARD FAIL");
    process.exit(1);
  }

  /* ---------------- STATE UPDATE ---------------- */

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        last_date_used: state.last_date_used,
        current_date: new Date().toISOString().slice(0, 10),
        last_URL_processed:
          `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${currentLast}`,
        last_article_number: currentLast
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE — PDFs:", generated);
})();
