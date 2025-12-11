import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getWeeklyData, setWeeklyData } from "./helpers/dataManager.js";

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------- Load weekly data safely -------------------- */
let { current_date, last_article_number } = getWeeklyData();

/* -------------------- Read PDF Folder -------------------- */
const pdfDir = path.join(__dirname, "PDFS");
const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith(".PDF"));

/* Extract article numbers and dates from filenames */
const newArticles = pdfFiles
  .map(filename => {
    const match = filename.match(/(\d{8})-(\d+)\.PDF/i);
    if (!match) return null;

    return {
      filename,
      date: match[1],
      number: Number(match[2])
    };
  })
  .filter(item => item && item.number > last_article_number)
  .sort((a, b) => a.number - b.number);

/* -------------------- Build Weekly Warning Message -------------------- */
let message = `## 📡 Weekly Warning Update  
**Date:** ${current_date}  
**Articles Found:** ${newArticles.length}

---

`;

if (newArticles.length === 0) {
  message += `No new high-impact articles were found since the last weekly scan.`;
} else {
  message += `### 📰 New Articles This Week\n`;
  newArticles.forEach(a => {
    message += `- **${a.date} — #${a.number}** (PDF: \`${a.filename}\`)\n`;
  });
}

/* -------------------- Update weekly data safely -------------------- */
let updated_last_article_number = last_article_number;

if (newArticles.length > 0) {
  updated_last_article_number = newArticles[newArticles.length - 1].number;
}

// Advance current_date → UTC date
const todayUTC = new Date().toISOString().split("T")[0];

setWeeklyData({
  current_date: todayUTC,
  last_article_number: updated_last_article_number
});

/* -------------------- Save output for GitHub Discussion -------------------- */
fs.writeFileSync(
  path.join(__dirname, "weekly_output.txt"),
  message
);

console.log("Weekly summary generated and saved.");
