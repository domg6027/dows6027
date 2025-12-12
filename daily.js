import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import https from "https";
import { exec } from "child_process";
import { getDailyData, setDailyData } from "./helpers/dataManager.js";

/* ------------------------------
   Load ONLY the daily fields
------------------------------ */
let { last_URL_processed, last_date_used } = getDailyData();

/* Extract last article number from URL */
let lastID = Number(last_URL_processed.split("recent_news_id=")[1]);

/* Base URL */
const BASE = "https://www.prophecynewswatch.com/article.cfm?recent_news_id=";

/* Output folder */
const PDF_DIR = "./PDFS";

/* Ensure PDF directory exists */
if (!existsSync(PDF_DIR)) {
  mkdirSync(PDF_DIR);
}

/* Fetch HTML page as text */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", (err) => reject(err));
  });
}

/* Extract publish date */
function extractDate(html) {
  // Looks for: <strong>Published: November 12, 2025</strong>
  let match = html.match(/Published:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
  if (!match) return null;
  return new Date(match[1]);
}

/* Convert Date → yyyyMMdd */
function formatDate(dateObj) {
  let yyyy = dateObj.getFullYear();
  let mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  let dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/* Convert HTML to PDF */
function createPDF(html, filename) {
  return new Promise((resolve, reject) => {
    const tmp = "temp.html";
    writeFileSync(tmp, html);

    exec(`wkhtmltopdf ${tmp} ${filename}`, (err) => {
      unlinkSync(tmp);
      if (err) reject(err);
      else resolve(true);
    });
  });
}

/* ------------------------------------
   Main — process new articles
------------------------------------- */
(async () => {
  let newProcessedCount = 0;
  let latestURL = last_URL_processed;
  let latestDate = last_date_used;

  for (let id = lastID + 1; id < lastID + 200; id++) {
    let url = BASE + id;

    try {
      let html = await fetchPage(url);

      if (html.includes("404") || html.includes("Not Found")) break;

      let pubDate = extractDate(html);
      if (!pubDate) break;

      let yyyymmdd = formatDate(pubDate);
      let outfile = `${PDF_DIR}/${yyyymmdd}-${id}.pdf`;

      await createPDF(html, outfile);

      latestURL = url;
      latestDate = yyyymmdd;

      newProcessedCount++;
      console.log(`PDF CREATED: ${outfile}`);

    } catch (err) {
      break;
    }
  }

  /* Save SAFE daily data fields */
  setDailyData({
    last_URL_processed: latestURL,
    last_date_used: latestDate
  });

  console.log(`Daily service completed: ${newProcessedCount} new PDF(s) created.`);
})();
