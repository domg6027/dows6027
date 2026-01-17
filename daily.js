/**
 * DOWS6027 – DAILY RUN (PDFME, NODE-ONLY)
 * ONE ARTICLE = ONE PDF
 * NO HTML RENDERING — TEXT FLOW ONLY
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import { text } from "@pdfme/common";

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* ─────────────────────────────────────── */
/* PATHS */
/* ─────────────────────────────────────── */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ─────────────────────────────────────── */
/* STATE */
/* ─────────────────────────────────────── */

let lastProcessed = 9256;
if (fs.existsSync(STATE_FILE)) {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (typeof s.last_article_number === "number") {
      lastProcessed = s.last_article_number;
    }
  } catch {}
}

/* ─────────────────────────────────────── */
/* FETCH */
/* ─────────────────────────────────────── */

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html"
        }
      },
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

/* ─────────────────────────────────────── */
/* HTML → CLEAN TEXT */
/* ─────────────────────────────────────── */

function stripHTML(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ─────────────────────────────────────── */
/* PDFME TEMPLATE */
/* ─────────────────────────────────────── */

const template = {
  basePdf: { width: 595, height: 842 }, // A4
  schemas: [
    {
      title: {
        type: "text",
        x: 40,
        y: 40,
        w: 515,
        h: 60,
        fontSize: 18,
        fontName: "Helvetica-Bold"
      },
      body: {
        type: "text",
        x: 40,
        y: 120,
        w: 515,
        h: 660,
        fontSize: 11,
        lineHeight: 1.4
      }
    }
  ]
};

/* ─────────────────────────────────────── */
/* MAIN */
/* ─────────────────────────────────────── */

async function main() {
  let archive;
  try {
    archive = await fetchPage("https://www.prophecynewswatch.com/archive.cfm");
  } catch {
    console.error("❌ Archive fetch failed");
    return;
  }

  const ids = [...new Set(
    (archive.match(/recent_news_id=\d+/g) || [])
      .map(x => Number(x.replace("recent_news_id=", "")))
      .filter(id => id > lastProcessed)
  )].sort((a, b) => a - b);

  console.log("📰 New articles found:", ids.length);

  let pdfCount = 0;

  for (const id of ids) {
    console.log("➡ Processing", id);

    let html;
    try {
      html = await fetchPage(
        "https://www.prophecynewswatch.com/article.cfm?recent_news_id=" + id
      );
    } catch {
      lastProcessed = id;
      continue;
    }

    /* BODY EXTRACTION (BOTH FORMATS) */
    let bodyHtml = null;
    const m1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const m2 = html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);

    if (m1) bodyHtml = m1[1];
    if (!bodyHtml && m2) bodyHtml = m2[1];

    if (!bodyHtml) {
      fs.writeFileSync(path.join(TMP_DIR, `FAIL-${id}.html`), html);
      lastProcessed = id;
      continue;
    }

    const textBody = stripHTML(bodyHtml);
    if (textBody.length < 200) {
      lastProcessed = id;
      continue;
    }

    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? stripHTML(titleMatch[1]) : "Prophecy News Watch";

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();

    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

    const inputs = [
      {
        title,
        body: textBody
      }
    ];

    try {
      const pdf = await generate({
        template,
        inputs,
        plugins: { text }
      });

      fs.writeFileSync(pdfPath, pdf);
      pdfCount++;
      console.log("✅ PDF created:", path.basename(pdfPath));
    } catch (e) {
      console.error("❌ PDFME failed:", id);
    }

    lastProcessed = id;
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        last_article_number: lastProcessed,
        updated_utc: new Date().toISOString()
      },
      null,
      2
    )
  );

  if (pdfCount === 0) {
    throw new Error("❌ NO PDFs GENERATED — HARD FAIL");
  }

  console.log(`✔ DAILY RUN COMPLETE — PDFs: ${pdfCount}`);
}

main();
