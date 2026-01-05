// daily.js (ESM) — DOWS6027 WARNING SERVICE
// Generates DAILY PDFs from ProphecyNewsWatch articles

import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import https from "https";
import { exec } from "child_process";
import { getDailyData, setDailyData } from "./helpers/dataManager.js";

/* ==================================================
   CONFIGURATION
================================================== */

const BASE =
  "https://www.prophecynewswatch.com/article.cfm?recent_news_id=";

const PDF_DIR = "./PDFS";
const MAX_SCAN = 200;

/* ==================================================
   INIT
================================================== */

if (!existsSync(PDF_DIR)) {
  mkdirSync(PDF_DIR, { recursive: true });
}

/* ==================================================
   HELPERS
================================================== */

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

/* Extract publish date from article body */
function extractDate(html) {
  const match = html.match(
    /Published:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i
  );
  return match ? new Date(match[1]) : null;
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function createPDF(html, filename) {
  return new Promise((resolve, reject) => {
    const tmpFile = "temp.html";

    writeFileSync(tmpFile, html);

    exec(`wkhtmltopdf ${tmpFile} ${filename}`, (err) => {
      unlinkSync(tmpFile);
      err ? reject(err) : resolve();
    });
  });
}

/* ==================================================
   MAIN
================================================== */

(async () => {
  console.log("📰 DAILY SERVICE STARTED (DOWS6027)");

  const dailyData = await getDailyData();

  let last_URL_processed =
    dailyData.last_URL_processed || `${BASE}0`;
  let last_date_used = dailyData.last_date_used || null;

  const lastID =
    Number(last_URL_processed.split("recent_news_id=")[1]) || 0;

  let createdCount = 0;

  for (let id = lastID + 1; id <= lastID + MAX_SCAN; id++) {
    const url = BASE + id;

    try {
      const html = await fetchPage(url);

      if (
        html.includes("404") ||
        html.includes("Not Found") ||
        html.length < 500
      ) {
        break;
      }

      const pubDate = extractDate(html);

      if (!pubDate || isNaN(pubDate)) {
        console.warn(
          `⚠ No valid publish date found for ID ${id}, skipping`
        );
        continue;
      }

      const ymd = formatDate(pubDate);
      const pdfPath = `${PDF_DIR}/${ymd}-${id}.pdf`;

      await createPDF(html, pdfPath);

      last_URL_processed = url;
      last_date_used = ymd;
      createdCount++;

      console.log(`📄 PDF CREATED: ${pdfPath}`);
    } catch (err) {
      console.error(`⚠ Failed to process ${url}`);
      continue;
    }
  }

  await setDailyData({
    ...dailyData,
    last_URL_processed,
    last_date_used,
  });

  console.log(
    `✅ DAILY SERVICE COMPLETED — ${createdCount} PDF(s) created.`
  );
})();
