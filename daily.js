/**
 * DOWS6027 – DAILY RUN
 * NODE-ONLY • PDFME • HARD FAIL SAFE
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import pkg from "@pdfme/common";

const { createBlankPdf } = pkg;

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ---------------- STATE LOAD ---------------- */

if (!fs.existsSync(STATE_FILE)) {
  console.error("❌ data.json missing — refusing to run");
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
} catch {
  console.error("❌ data.json corrupted — refusing to run");
  process.exit(1);
}

const lastProcessed = Number(state.last_article_number);

if (!Number.isInteger(lastProcessed) || lastProcessed <= 0) {
  console.error("❌ INVALID last_article_number — refusing to run");
  process.exit(1);
}

/* ---------------- FETCH ---------------- */

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
  let archive;
  try {
    archive = await fetchPage("https://www.prophecynewswatch.com/archive.cfm");
  } catch {
    console.error("❌ Archive fetch failed");
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

  console.log("📰 New articles found:", ids.length);

  let generated = 0;
  let currentLast = lastProcessed;

  for (const id of ids) {
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetchPage(
        "https://www.prophecynewswatch.com/article.cfm?recent_news_id=" + id
      );
    } catch {
      currentLast = id;
      continue;
    }

    let body = null;
    const a1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const a2 = html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);
    if (a1) body = a1[1];
    if (!body && a2) body = a2[1];

    if (!body) {
      fs.writeFileSync(path.join(TMP_DIR, `FAIL-${id}.html`), html);
      currentLast = id;
      continue;
    }

    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 300) {
      currentLast = id;
      continue;
    }

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();
    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

    /* -------- PDFME (CORRECT SETUP) -------- */

    const basePdf = await createBlankPdf();

    const template = {
      basePdf,
      schemas: [
        {
          content: {
            type: "text",
            position: { x: 20, y: 20 },
            width: 170,
            height: 260,
            fontSize: 11,
            lineHeight: 1.3
          }
        }
      ]
    };

    try {
      const pdf = await generate({
        template,
        inputs: [{ content: text }]
      });

      fs.writeFileSync(pdfPath, Buffer.from(pdf));
      generated++;
    } catch (e) {
      console.error("❌ PDF generation failed:", id);
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
          "https://www.prophecynewswatch.com/article.cfm?recent_news_id=" +
          currentLast,
        last_article_number: currentLast
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE — PDFs:", generated);
})();
