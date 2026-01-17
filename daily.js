/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * PDFME VERSION – CI SAFE / NO SYSTEM BINARIES
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import { text } from "@pdfme/schemas";

/* ─────────────────────────────────────── */
/* BOOT */
/* ─────────────────────────────────────── */

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });

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
  } catch {
    console.warn("⚠️ data.json unreadable, using fallback");
  }
}

/* ─────────────────────────────────────── */
/* FETCH (SAFE) */
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
/* PDF TEMPLATE */
/* ─────────────────────────────────────── */

function buildTemplate() {
  return {
    basePdf: { width: 595, height: 842 },
    schemas: [
      {
        title: {
          type: "text",
          x: 40,
          y: 40,
          width: 515,
          height: 60,
          fontSize: 20,
          fontName: "Helvetica-Bold"
        },
        date: {
          type: "text",
          x: 40,
          y: 105,
          width: 515,
          height: 20,
          fontSize: 10
        },
        body: {
          type: "text",
          x: 40,
          y: 140,
          width: 515,
          height: 640,
          fontSize: 11,
          lineHeight: 1.4
        },
        footer: {
          type: "text",
          x: 40,
          y: 800,
          width: 515,
          height: 20,
          fontSize: 9
        }
      }
    ]
  };
}

/* ─────────────────────────────────────── */
/* MAIN */
/* ─────────────────────────────────────── */

(async function main() {
  let archive = "";
  try {
    archive = await fetchPage("https://www.prophecynewswatch.com/archive.cfm");
  } catch {
    throw new Error("❌ Archive fetch failed");
  }

  const ids =
    (archive.match(/recent_news_id=\d+/g) || [])
      .map(x => Number(x.replace("recent_news_id=", "")))
      .filter(id => id > lastProcessed)
      .sort((a, b) => a - b);

  console.log("📰 New articles found:", ids.length);

  let pdfCount = 0;

  for (const id of ids) {
    console.log("➡ Processing", id);

    let html = "";
    try {
      html = await fetchPage(
        "https://www.prophecynewswatch.com/article.cfm?recent_news_id=" + id
      );
    } catch {
      lastProcessed = id;
      continue;
    }

    const bodyMatch =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);

    if (!bodyMatch) {
      lastProcessed = id;
      continue;
    }

    const bodyText = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!bodyText) {
      lastProcessed = id;
      continue;
    }

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Prophecy News Watch";

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const dateText = dateMatch ? dateMatch[1] : new Date().toDateString();

    const ymd = new Date(dateText);
    const fileDate =
      ymd.getUTCFullYear().toString() +
      String(ymd.getUTCMonth() + 1).padStart(2, "0") +
      String(ymd.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, `${fileDate}-${id}.pdf`);

    const template = buildTemplate();

    const inputs = [
      {
        title,
        date: dateText,
        body: bodyText,
        footer:
          "Source: prophecynewswatch.com | Article ID " + id
      }
    ];

    const pdf = await generate({
      template,
      inputs,
      plugins: { text }
    });

    fs.writeFileSync(pdfPath, pdf);

    if (!fs.existsSync(pdfPath)) {
      throw new Error("❌ PDF write failed for " + id);
    }

    pdfCount++;
    lastProcessed = id;
  }

  if (pdfCount === 0) {
    throw new Error("❌ NO PDFs GENERATED — HARD FAIL");
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

  console.log("✅ PDFs created:", pdfCount);
  console.log("✔ DAILY RUN COMPLETE");
})();
