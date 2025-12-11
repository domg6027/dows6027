// weekly.js
const fs = require("fs");
const path = require("path");

// Load data.js
const dataPath = path.join(__dirname, "data.js");
const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

// Pull values for weekly automation
let { current_date, last_article_number } = data;

// TODAY (UTC) for file naming
const today = new Date().toISOString().split("T")[0];

// Folder paths
const pdfFolder = path.join(__dirname, "PDFS");
const warningsFolder = path.join(__dirname, "warning2026");

// Ensure folder exists
if (!fs.existsSync(warningsFolder)) {
  fs.mkdirSync(warningsFolder);
}

// Extract all PDFs
const pdfFiles = fs.readdirSync(pdfFolder).filter(f => f.endsWith(".pdf"));

/**
 * Parse filenames like:
 *    20251129-9053.pdf
 */
function parsePdfName(filename) {
  const base = filename.replace(".pdf", "");
  const [date, seq] = base.split("-");
  return { date, seq: parseInt(seq, 10), filename };
}

// Identify new articles
const newArticles = pdfFiles
  .map(parsePdfName)
  .filter(item => item.seq > last_article_number)
  .sort((a, b) => a.seq - b.seq);

if (newArticles.length === 0) {
  console.log("No new PDFs for weekly summary.");
} else {
  console.log("New articles found:", newArticles.length);
}

// Build weekly summary message
let summaryText = `WEEKLY WARNING SUMMARY – ${today}\n`;
summaryText += `Generated automatically by DOWS6027 automation.\n\n`;
summaryText += `Total new articles: ${newArticles.length}\n\n`;

for (const article of newArticles) {
  summaryText += `• ${article.date} — Article #${article.seq}\n`;
}

// Save to a new file in warning2026/
const outputFilename = `weekly-${today}.txt`;
const outputPath = path.join(warningsFolder, outputFilename);

fs.writeFileSync(outputPath, summaryText, "utf-8");

console.log(`Weekly summary saved: ${outputFilename}`);

// Update data.js
data.current_date = today;
if (newArticles.length > 0) {
  data.last_article_number =
    newArticles[newArticles.length - 1].seq;
}

// Save updated data.js
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

console.log("data.js updated.");
console.log("Weekly processing complete.");
