// monthly.js
// Node script to build monthly archive and perform year-rollover updates
// Uses CommonJS so it runs with current repo scripts that use require()

const fs = require("fs");
const path = require("path");

// Helpers
const read = p => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
const write = (p, txt) => fs.writeFileSync(p, txt, "utf8");
const ensureDir = p => { if (!fs.existsSync(p)) fs.mkdirSync(p); };

// Paths
const root = __dirname;
const pdfDir = path.join(root, "PDFS");
const indexPath = path.join(root, "index2.html");
const archivePath = path.join(root, "archive.html");
const dataPath = path.join(root, "data.js");

// Safety backups
function backupFile(src) {
  if (!fs.existsSync(src)) return;
  const bak = src + ".bak";
  fs.copyFileSync(src, bak);
  console.log(`Backup created: ${path.basename(bak)}`);
}

// Parse dates
const today = new Date();
const yyyy = today.getUTCFullYear();
const mm = today.getUTCMonth() + 1; // 1..12
const dd = today.getUTCDate();

// Determine archive month = previous month
let archiveYear = yyyy;
let archiveMonth = mm - 1;
if (archiveMonth === 0) {
  archiveMonth = 12;
  archiveYear = yyyy - 1;
}
const archiveMonthStr = String(archiveMonth).padStart(2, "0");
const archiveYearStr = String(archiveYear);

// Ensure PDF folder exists
ensureDir(pdfDir);

// 1) Build monthly list (previous month)
const allFiles = fs.readdirSync(pdfDir).filter(f => /\.pdf$/i.test(f));
const monthlyPDFs = allFiles.filter(f => {
  // expect yyyyMMdd-nnnn.pdf
  const m = f.match(/^(\d{8})-(\d+)\.pdf$/i);
  if (!m) return false;
  const fileDate = m[1];             // yyyymmdd
  const fYear = fileDate.slice(0,4);
  const fMonth = fileDate.slice(4,6);
  return (fYear === archiveYearStr && fMonth === archiveMonthStr);
}).sort();

// Create archive text file in PDFS/
const archiveFilename = `archive-${archiveYearStr}-${archiveMonthStr}.txt`;
const archiveFilePath = path.join(pdfDir, archiveFilename);

let archiveContent = `# Archive for ${archiveYearStr}-${archiveMonthStr}\n`;
archiveContent += `# Total PDFs: ${monthlyPDFs.length}\n\n`;
monthlyPDFs.forEach(f => archiveContent += `${f}\n`);

write(archiveFilePath, archiveContent);
console.log(`Monthly archive written: ${archiveFilename}`);

// 2) Yearly rollover logic (only when current month is January)
if (mm === 1) {
  console.log("Year-rollover processing (current month = January).");

  // 2a) Backup index2.html and archive.html
  backupFile(indexPath);
  backupFile(archivePath);

  // 2b) Read index2.html and extract LI lines from the UL with id="latest-warnings"
  let indexHtml = read(indexPath);
  if (indexHtml === null) {
    console.error("ERROR: index2.html not found. Aborting rollover insertion.");
  } else {
    // Find the UL with id="latest-warnings"
    const ulIdPattern = /<ul[^>]*id=["']latest-warnings["'][^>]*>([\s\S]*?)<\/ul>/i;
    const match = indexHtml.match(ulIdPattern);

    let liBlock = "";
    if (match) {
      const inner = match[1];
      // Extract all <li>...</li> from inner - keep them as-is
      const lis = inner.match(/<li[\s\S]*?<\/li>/gi) || [];
      if (lis.length === 0) {
        console.log("No <li> entries found inside #latest-warnings - nothing to move.");
      } else {
        liBlock = lis.join("\n");
        // Remove the LI lines from the UL content (leave UL empty)
        const newUl = match[0].replace(inner, "\n    ");
        indexHtml = indexHtml.replace(match[0], newUl);
        write(indexPath, indexHtml);
        console.log(`Extracted ${lis.length} <li> lines from index2.html and cleared the UL.`);
      }
    } else {
      console.warn("UL with id='latest-warnings' not found in index2.html. Nothing extracted.");
    }

    // 2c) If there were LI lines, insert them into archive.html under previous year section
    if (liBlock) {
      let archiveHtml = read(archivePath);
      if (archiveHtml === null) {
        console.error("ERROR: archive.html not found. Aborting insertion of LI lines.");
      } else {
        // Look for previous year header like: <h3 class="section-title"><u>2025 ARCHIVE</u></h3>\n<ul>...</ul>
        const yearHeaderPattern = new RegExp(`(<h3[^>]*>\\s*<u>\\s*${archiveYearStr}\\s*ARCHIVE\\s*<\\/u>\\s*<\\/h3>\\s*)(<ul[^>]*>)([\\s\\S]*?)(<\\/ul>)`, "i");
        const yearMatch = archiveHtml.match(yearHeaderPattern);

        if (yearMatch) {
          // Insert liBlock into the matched ul content
          const existingUlContent = yearMatch[3];
          const newUlContent = `\n  ${liBlock}\n  ${existingUlContent.trim() ? existingUlContent : ""}\n`;
          const replaced = yearMatch[1] + yearMatch[2] + newUlContent + yearMatch[4];
          archiveHtml = archiveHtml.replace(yearMatch[0], replaced);
          write(archivePath, archiveHtml);
          console.log(`Inserted ${liBlock.split(/<li/).length - 1} <li> entries into archive.html under ${archiveYearStr}.`);
        } else {
          // If the previous year section not found, append it near the end before the next year's section or at the end
          console.warn(`Previous year section for ${archiveYearStr} not found in archive.html. Appending a new section.`);
          const newSection = `\n<h3 class="section-title"><u>${archiveYearStr} ARCHIVE</u></h3>\n<ul>\n  ${liBlock}\n</ul>\n`;
          // Insert before end of body if possible
          const bodyClose = archiveHtml.lastIndexOf("</body>");
          if (bodyClose !== -1) {
            archiveHtml = archiveHtml.slice(0, bodyClose) + newSection + archiveHtml.slice(bodyClose);
          } else {
            archiveHtml += newSection;
          }
          write(archivePath, archiveHtml);
          console.log(`Appended new ${archiveYearStr} section to archive.html and inserted entries.`);
        }
      }
    }

    // 2d) Ensure new year section exists in archive.html (the new year is 'yyyy' because we moved previous year's LIs)
    // newYear = current year (yyyy) because mm === 1
    const newYear = String(yyyy);
    let archiveHtmlNow = read(archivePath);
    if (archiveHtmlNow) {
      const newYearPattern = new RegExp(`<h3[^>]*>\\s*<u>\\s*${newYear}\\s*ARCHIVE\\s*<\\/u>\\s*<\\/h3>`, "i");
      if (!archiveHtmlNow.match(newYearPattern)) {
        // Append the empty section for the new year at the end (before closing body if present)
        const addition = `\n<h3 class="section-title"><u>${newYear} ARCHIVE</u></h3>\n<ul>\n  <!-- AUTOMATION WILL INSERT ENTRIES HERE -->\n</ul>\n`;
        const bodyClose = archiveHtmlNow.lastIndexOf("</body>");
        if (bodyClose !== -1) {
          archiveHtmlNow = archiveHtmlNow.slice(0, bodyClose) + addition + archiveHtmlNow.slice(bodyClose);
        } else {
          archiveHtmlNow += addition;
        }
        write(archivePath, archiveHtmlNow);
        console.log(`Added empty ${newYear} section to archive.html.`);
      } else {
        console.log(`New year section ${newYear} already present in archive.html.`);
      }
    }
  }

  // 2e) Create new yearly folder warningYYYY (for the new year) if not exists
  const newWarningFolder = path.join(root, `warning${yyyy}`);
  if (!fs.existsSync(newWarningFolder)) {
    fs.mkdirSync(newWarningFolder);
    // create .nomedia file
    const nomediaPath = path.join(newWarningFolder, ".nomedia");
    write(nomediaPath, "");
    console.log(`Created folder and .nomedia: warning${yyyy}/`);
  } else {
    // ensure .nomedia exists
    const nomediaPath = path.join(newWarningFolder, ".nomedia");
    if (!fs.existsSync(nomediaPath)) {
      write(nomediaPath, "");
      console.log(`Created .nomedia in existing folder: warning${yyyy}/`);
    } else {
      console.log(`warning${yyyy}/ already exists with .nomedia.`);
    }
  }
} // end rollover block

// 3) Update data.js current_date
let dataObj = {};
if (fs.existsSync(dataPath)) {
  dataObj = JSON.parse(read(dataPath));
}
const todayUTC = today.toISOString().split("T")[0];
dataObj.current_date = todayUTC;
write(dataPath, JSON.stringify(dataObj, null, 2));
console.log("Updated data.js.current_date to", todayUTC);

console.log("Monthly script finished.");
