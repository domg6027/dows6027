import fs from "fs";
import https from "https";
import child_process from "child_process";

/* ------------------------------
   Load existing data.js
------------------------------ */
let data = JSON.parse(fs.readFileSync("data.js", "utf8"));

let lastURL = data.last_URL_processed;
let lastDateUsed = data.last_date_used;

/* Extract last article number */
let lastID = Number(lastURL.split("recent_news_id=")[1]);

/* Base URL */
const BASE = "https://www.prophecynewswatch.com/article.cfm?recent_news_id=";

/* Output folder */
const PDF_DIR = "./PDFS";

/* Ensure PDF dir exists */
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR);
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

/* Extract publish date from page */
function extractDate(html) {
  // Format example: <strong>Published: November 12, 2025</strong>
  let match = html.match(/Published:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
  if (!match) return null;

  return new Date(match[1]);
}

/* Convert date → yyyyMMdd */
function formatDate(dateObj) {
  let yyyy = dateObj.getFullYear();
  let mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  let dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/* Create PDF using wkhtmltopdf */
function createPDF(html, filename) {
  return new Promise((resolve, reject) => {
    const tmp = "temp.html";
    fs.writeFileSync(tmp, html);

    child_process.exec(
      `wkhtmltopdf ${tmp} ${filename}`,
      (err, stdout, stderr) => {
        fs.unlinkSync(tmp);
        if (err) reject(err);
        else resolve(true);
      }
    );
  });
}

/* ------------------------------------
   Main processing loop — FETCH NEW ARTICLES
------------------------------------- */
(async () => {
  let newProcessedCount = 0;

  for (let id = lastID + 1; id < lastID + 200; id++) {
    let url = BASE + id;

    try {
      let html = await fetchPage(url);

      // If site returns "not found", break loop
      if (html.includes("404") || html.includes("Not Found")) break;

      let pubDate = extractDate(html);
      if (!pubDate) break;

      let yyyymmdd = formatDate(pubDate);
      let outfile = `${PDF_DIR}/${yyyymmdd}-${id}.pdf`;

      await createPDF(html, outfile);

      // Update daily tracking
      data.last_URL_processed = url;
      data.last_date_used = yyyymmdd;

      newProcessedCount++;
      console.log(`PDF CREATED: ${outfile}`);

    } catch (err) {
      break;
    }
  }

  /* ------------------------------------
     Write updated data.js
  ------------------------------------- */
  fs.writeFileSync("data.js", JSON.stringify(data, null, 2));

  console.log(`Daily service completed: ${newProcessedCount} new PDF(s) created.`);
})();
