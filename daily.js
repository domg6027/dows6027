import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import https from "https";
import { exec } from "child_process";
import { getDailyData, setDailyData } from "./helpers/dataManager.js";

/* ==============================
   CONFIG
============================== */

const ARCHIVE_URL = "https://www.prophecynewswatch.com/archive.cfm";
const ARTICLE_BASE = "https://www.prophecynewswatch.com/article.cfm?recent_news_id=";
const PDF_DIR = "./PDFS";

if (!existsSync(PDF_DIR)) {
  mkdirSync(PDF_DIR);
}

/* ==============================
   HELPERS
============================== */

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function formatDate(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function createPDF(html, filename) {
  return new Promise((resolve, reject) => {
    const tmp = "temp.html";
    writeFileSync(tmp, html);
    exec(`wkhtmltopdf ${tmp} ${filename}`, err => {
      unlinkSync(tmp);
      err ? reject(err) : resolve();
    });
  });
}

/* ==============================
   ARCHIVE PARSER
============================== */

function parseArchive(html) {
  const results = [];

  /*
    Matches blocks like:
    article.cfm?recent_news_id=12345
    ...
    November 12, 2025
  */

  const regex = /article\.cfm\?recent_news_id=(\d+)[\s\S]*?([A-Za-z]+\s+\d{1,2},\s+\d{4})/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push({
      id: Number(match[1]),
      date: new Date(match[2])
    });
  }

  return results;
}

/* ==============================
   MAIN
============================== */

(async () => {
  const dailyData = await getDailyData();

  let last_URL_processed = dailyData.last_URL_processed || ARTICLE_BASE + "0";
  let last_date_used = dailyData.last_date_used || null;

  const lastID = Number(last_URL_processed.split("recent_news_id=")[1]) || 0;

  console.log(`▶ Last processed ID: ${lastID}`);

  const archiveHTML = await fetchPage(ARCHIVE_URL);
  const archiveItems = parseArchive(archiveHTML)
    .filter(a => a.id > lastID)
    .sort((a,b) => a.id - b.id);

  if (!archiveItems.length) {
    console.log("ℹ No new articles found.");
    return;
  }

  let created = 0;

  for (const item of archiveItems) {
    const articleURL = ARTICLE_BASE + item.id;
    const ymd = formatDate(item.date);
    const outfile = `${PDF_DIR}/${ymd}-${item.id}.pdf`;

    try {
      const html = await fetchPage(articleURL);
      await createPDF(html, outfile);

      last_URL_processed = articleURL;
      last_date_used = ymd;
      created++;

      console.log(`📄 PDF CREATED: ${outfile}`);
    } catch (err) {
      console.error(`⚠ Failed ID ${item.id}`, err);
    }
  }

  await setDailyData({
    ...dailyData,
    last_URL_processed,
    last_date_used
  });

  console.log(`✅ Daily completed: ${created} PDF(s) created.`);
})();
