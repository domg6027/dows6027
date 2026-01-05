import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import https from "https";
import { exec } from "child_process";
import { getDailyData, setDailyData } from "./helpers/dataManager.js";

/* ------------------------------
   Init
------------------------------ */

const BASE = "https://www.prophecynewswatch.com/article.cfm?recent_news_id=";
const PDF_DIR = "./PDFS";

if (!existsSync(PDF_DIR)) {
  mkdirSync(PDF_DIR);
}

/* ------------------------------
   Helpers
------------------------------ */

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function extractDate(html) {
  const match = html.match(/Published:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
  return match ? new Date(match[1]) : null;
}

function formatDate(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function createPDF(html, filename) {
  return new Promise((resolve, reject) => {
    const tmp = "temp.html";
    writeFileSync(tmp, html);
    exec(`wkhtmltopdf ${tmp} ${filename}`, (err) => {
      unlinkSync(tmp);
      err ? reject(err) : resolve();
    });
  });
}

/* ------------------------------
   MAIN
------------------------------ */
(async () => {
  const dailyData = await getDailyData();

  let last_URL_processed = dailyData.last_URL_processed || BASE + "0";
  let last_date_used = dailyData.last_date_used || null;

  let lastID = Number(last_URL_processed.split("recent_news_id=")[1]) || 0;

  let created = 0;

  for (let id = lastID + 1; id < lastID + 200; id++) {
    const url = BASE + id;

    try {
      const html = await fetchPage(url);

      if (html.includes("404") || html.includes("Not Found")) break;

      const pubDate = extractDate(html);
      if (!pubDate) continue;

      const ymd = formatDate(pubDate);
      const outfile = `${PDF_DIR}/${ymd}-${id}.pdf`;

      await createPDF(html, outfile);

      last_URL_processed = url;
      last_date_used = ymd;
      created++;

      console.log(`📄 PDF CREATED: ${outfile}`);

    } catch (err) {
      console.error(`⚠ Failed ${url}`, err);
      continue;
    }
  }

  await setDailyData({
    ...dailyData,
    last_URL_processed,
    last_date_used
  });

  console.log(`✅ Daily completed: ${created} PDFs created.`);
})();
