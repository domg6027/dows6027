const fs = require("fs");
const path = require("path");

// -------------------- Load Data --------------------
const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data.js"), "utf8")
);

let { current_date, last_article_number } = data;

// -------------------- Read PDF Folder --------------------
const pdfDir = path.join(__dirname, "PDFS");
const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith(".PDF"));

// Extract article numbers from filenames
const newArticles = pdfFiles
  .map(filename => {
    const match = filename.match(/(\d{8})-(\d+)\.PDF/i);
    if (!match) return null;

    const articleNumber = parseInt(match[2], 10);
    return {
      filename,
      date: match[1],
      number: articleNumber
    };
  })
  .filter(item => item && item.number > last_article_number)
  .sort((a, b) => a.number - b.number);

// -------------------- Build Weekly Warning Message --------------------
let message = `## 📡 Weekly Warning Update  
**Date:** ${current_date}  
**Articles Found:** ${newArticles.length}

---

`;

if (newArticles.length === 0) {
  message += `No new high-impact articles were found since the last weekly scan.`;
} else {
  message += `### 📰 New Articles This Week  
`;
  newArticles.forEach(a => {
    message += `- **${a.date} — #${a.number}** (PDF: \`${a.filename}\`)\n`;
  });
}

// -------------------- Update data.js --------------------
if (newArticles.length > 0) {
  const newest = newArticles[newArticles.length - 1].number;
  data.last_article_number = newest;
}

// Advance current_date to today's date (UTC)
const todayUTC = new Date().toISOString().split("T")[0];
data.current_date = todayUTC;

// Write new data.js
fs.writeFileSync(
  path.join(__dirname, "data.js"),
  JSON.stringify(data, null, 2)
);

// Save output file for GitHub Discussion
fs.writeFileSync(
  path.join(__dirname, "weekly_output.txt"),
  message
);

console.log("Weekly summary generated and saved.");
