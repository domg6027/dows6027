/**
 * DOWS6027 – DAILY PDF GENERATOR
 * Node.js + PDFME (FINAL, WORKING)
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";

/* -------------------- BOOT -------------------- */

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* -------------------- STATE -------------------- */

if (!fs.existsSync(STATE_FILE)) {
  console.error("❌ data.json missing — refusing to run");
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
const lastId = Number(state.last_article_number);

if (!Number.isInteger(lastId) || lastId < 9000) {
  console.error("❌ INVALID last_article_number — refusing to run");
  process.exit(1);
}

/* -------------------- MODE -------------------- */

const lastDate = new Date(state.last_date_used);
const today = new Date();
const gapDays = Math.floor((today - lastDate) / 86400000);
const MODE = gapDays > 7 ? "CATCHUP" : "SCRAPE";

console.log(`ℹ Mode selected: ${MODE} (${gapDays} days gap)`);

/* -------------------- HTTP -------------------- */

function fetch(url) {
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

/* -------------------- ARTICLE IDS -------------------- */

async function getIds() {
  if (MODE === "CATCHUP") {
    return Array.from({ length: 2000 }, (_, i) => lastId + i + 1);
  }

  const archive = await fetch("https://www.prophecynewswatch.com/archive.cfm");
  return Array.from(
    new Set(
      (archive.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter(id => id > lastId)
    .sort((a, b) => a - b);
}

/* -------------------- MINIMAL BLANK PDF -------------------- */
/* A valid one-page A4 PDF (DO NOT TOUCH) */

const BASE_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >> endobj
4 0 obj << /Length 0 >> stream
endstream
endobj
xref
0 5
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000117 00000 n
0000000210 00000 n
trailer << /Root 1 0 R /Size 5 >>
startxref
260
%%EOF`
);

/* -------------------- MAIN -------------------- */

(async () => {
  const ids = await getIds();
  console.log("📰 Articles to process:", ids.length);

  const fontData = fs.readFileSync(FONT_PATH);

  let generated = 0;
  let lastSuccess = lastId;

  for (const id of ids) {
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      continue;
    }

    const body =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
      html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i)?.[1];

    if (!body) continue;

    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 400) continue;

    const d =
      html.match(/(\w+ \d{1,2}, \d{4})/)?.[1]
        ? new Date(RegExp.$1)
        : new Date();

    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const template = {
      basePdf: BASE_PDF,
      fonts: {
        Swansea: fontData
      },
      schemas: [
        {
          article: {
            type: "text",
            position: { x: 20, y: 30 },
            width: 170,
            height: 780,
            fontSize: 11,
            fontName: "Swansea",
            lineHeight: 1.4,
            wrap: true
          }
        }
      ]
    };

    try {
      const pdf = await generate({
        template,
        inputs: [{ article: text }]
      });

      fs.writeFileSync(
        path.join(PDF_DIR, `${ymd}-${id}.pdf`),
        pdf
      );

      generated++;
      lastSuccess = id;
    } catch (e) {
      console.error("❌ PDF generation failed for", id);
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
        last_date_used: today.toISOString().slice(0, 10),
        current_date: today.toISOString().slice(0, 10),
        last_URL_processed:
          `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${lastSuccess}`,
        last_article_number: lastSuccess
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE — PDFs:", generated);
})();
