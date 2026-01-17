/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * HARDENED MULTI-FORMAT SCRAPER + PDFME
 * 2026 SAFE VERSION
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "pdfme";
import { text } from "pdfme/plugins";

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ---------------- STATE ---------------- */

let lastProcessed = 9256;

if (fs.existsSync(STATE_FILE)) {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (typeof s.last_article_number === "number") {
      lastProcessed = s.last_article_number;
    }
  } catch {}
}

/* ---------------- FETCH ---------------- */

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html",
        },
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

/* ---------------- CLEAN HTML ---------------- */

function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<ins[\s\S]*?<\/ins>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");
}

/* ---------------- EXTRACT CONTENT ---------------- */

function extractArticle(html) {
  let match = null;

  // 1️⃣ OLD FORMAT
  match = html.match(
    /<div[^>]*class="entry_content"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (match && match[1].length > 500) return match[1];

  // 2️⃣ OLD <article>
  match = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (match && match[1].length > 500) return match[1];

  // 3️⃣ NEW FORMAT (MAIN CONTENT COLUMN)
  match = html.match(
    /<div[^>]*class="col col_9_of_12"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (match && match[1].length > 500) return match[1];

  // 4️⃣ LAST RESORT: BODY
  match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (match && match[1].length > 1000) return match[1];

  return null;
}

/* ---------------- TEXTIFY ---------------- */

function htmlToText(html) {
  return stripNoise(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---------------- MAIN ---------------- */

(async function main() {
  let archive;

  try {
    archive = await fetchPage(
      "https://www.prophecynewswatch.com/archive.cfm"
    );
  } catch {
    console.error("❌ Failed to fetch archive");
    return;
  }

  const ids =
    archive
      .match(/recent_news_id=\d+/g)
      ?.map(x => Number(x.replace("recent_news_id=", "")))
      .filter(id => id > lastProcessed)
      .sort((a, b) => a - b) || [];

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

    const raw = extractArticle(html);
    if (!raw) {
      fs.writeFileSync(path.join(TMP_DIR, "FAIL-" + id + ".html"), html);
      lastProcessed = id;
      continue;
    }

    const textContent = htmlToText(raw);
    if (textContent.length < 500) {
      lastProcessed = id;
      continue;
    }

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();

    const ymd =
      d.getUTCFullYear() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, ymd + "-" + id + ".pdf");

    try {
      await generate({
        filePath: pdfPath,
        template: {
          schemas: [[{ name: "content", type: "text" }]],
        },
        inputs: [{ content: textContent }],
        plugins: { text },
      });

      pdfCount++;
    } catch (e) {
      console.error("⚠ PDF generation failed for", id);
    }

    lastProcessed = id;
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        last_article_number: lastProcessed,
        updated_utc: new Date().toISOString(),
      },
      null,
      2
    )
  );

  if (pdfCount === 0) {
    throw new Error("❌ NO PDFs GENERATED — CHECK SITE STRUCTURE");
  }

  console.log("✔ DAILY RUN COMPLETE — PDFs:", pdfCount);
})();
