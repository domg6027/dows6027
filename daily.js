/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * PDFME VERSION – HARD FAIL SAFE
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";
import { text } from "@pdfme/schemas";

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* =======================
   PATHS & DIRECTORIES
======================= */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* =======================
   STATE
======================= */

let lastProcessed = 9256;

if (fs.existsSync(STATE_FILE)) {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (typeof s.last_article_number === "number") {
      lastProcessed = s.last_article_number;
    }
  } catch {}
}

/* =======================
   FETCH HELPER
======================= */

function fetchPage(url) {
  return new Promise(function (resolve, reject) {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/html",
          "Accept-Language": "en-US,en;q=0.9"
        }
      },
      function (res) {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      }
    );

    req.setTimeout(20000, function () {
      req.destroy();
      reject(new Error("timeout"));
    });

    req.on("error", reject);
  });
}

/* =======================
   PDF CREATOR (PDFME)
======================= */

async function createPdf(title, body, outputPath) {
  const template = {
    schemas: [
      {
        title: {
          type: "text",
          position: { x: 20, y: 20 },
          width: 170,
          height: 20
        },
        body: {
          type: "text",
          position: { x: 20, y: 45 },
          width: 170,
          height: 230
        }
      }
    ]
  };

  const inputs = [
    {
      title: title,
      body: body
    }
  ];

  const pdfBuffer = await generate({
    template: template,
    inputs: inputs,
    plugins: { text: text }
  });

  fs.writeFileSync(outputPath, pdfBuffer);

  const stats = fs.statSync(outputPath);
  if (!stats || stats.size < 1000) {
    throw new Error("PDF WRITE FAILED: " + outputPath);
  }

  console.log("✅ PDF GENERATED:", outputPath, stats.size, "bytes");
}

/* =======================
   MAIN
======================= */

(async function main() {
  let archive = "";

  try {
    archive = await fetchPage("https://www.prophecynewswatch.com/archive.cfm");
  } catch {
    console.error("❌ Archive fetch failed");
    return;
  }

  const matches = archive.match(/recent_news_id=\d+/g) || [];

  const ids = matches
    .map(x => Number(x.replace("recent_news_id=", "")))
    .filter(id => id > lastProcessed)
    .sort((a, b) => a - b);

  console.log("📰 New articles found:", ids.length);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
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

    let body = null;

    const m1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const m2 = html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);

    if (m1) body = m1[1];
    if (!body && m2) body = m2[1];

    if (!body) {
      fs.writeFileSync(path.join(TMP_DIR, "FAIL-" + id + ".html"), html);
      lastProcessed = id;
      continue;
    }

    const cleanBody = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();

    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, ymd + "-" + id + ".pdf");

    try {
      await createPdf(
        "Prophecy News Watch – " + id,
        cleanBody,
        pdfPath
      );
    } catch (e) {
      console.error("❌ PDF ERROR:", e.message);
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

  const pdfs = fs.readdirSync(PDF_DIR).filter(f => f.endsWith(".pdf"));
  if (pdfs.length === 0) {
    throw new Error("❌ NO PDFs GENERATED — HARD FAIL");
  }

  console.log("✔ DAILY RUN COMPLETE");
})();
