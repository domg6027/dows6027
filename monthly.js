// monthly.js (ESM final version with YEAR-SPECIFIC hard-lock)
// -----------------------------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helpers
const read = p => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
const write = (p, txt) => fs.writeFileSync(p, txt, "utf8");
const ensureDir = p => { if (!fs.existsSync(p)) fs.mkdirSync(p); };

// ---------------------------------------------------------
// DATE CALCULATIONS
// ---------------------------------------------------------
const today = new Date();
const yyyy = today.getUTCFullYear();
const mm = today.getUTCMonth() + 1;

let archiveYear = yyyy;
let archiveMonth = mm - 1;

if (archiveMonth === 0) {
  archiveMonth = 12;
  archiveYear = yyyy - 1;
}

const archiveYearStr = String(archiveYear);
const archiveMonthStr = String(archiveMonth).padStart(2, "0");

// ---------------------------------------------------------
// YEAR-SPECIFIC HARD LOCK
// Only prevents re-running the **rollover** portion
// ---------------------------------------------------------
const rolloverLockPath = path.join(__dirname, `rollover-${yyyy}.lock`);

// ---------------------------------------------------------
// PATHS
// ---------------------------------------------------------
const root = __dirname;
const pdfDir = path.join(root, "PDFS");
const indexPath = path.join(root, "index2.html");
const archivePath = path.join(root, "archive.html");

// ---------------------------------------------------------
// BACKUP FUNCTION
// ---------------------------------------------------------
function backupFile(src) {
  if (!fs.existsSync(src)) return;
  const bak = src + ".bak";
  fs.copyFileSync(src, bak);
  console.log(`Backup created: ${path.basename(bak)}`);
}

// ---------------------------------------------------------
// ENSURE PDF DIRECTORY EXISTS
// ---------------------------------------------------------
ensureDir(pdfDir);

// ---------------------------------------------------------
// 1) MONTHLY ARCHIVE CREATION (ALWAYS RUNS)
// ---------------------------------------------------------
const allFiles = fs.readdirSync(pdfDir).filter(f => /\.pdf$/i.test(f));

const monthlyPDFs = allFiles
  .filter(f => {
    const m = f.match(/^(\d{8})-(\d+)\.pdf$/i);
    if (!m) return false;
    const yyyymmdd = m[1];
    return (
      yyyymmdd.slice(0, 4) === archiveYearStr &&
      yyyymmdd.slice(4, 6) === archiveMonthStr
    );
  })
  .sort();

const archiveFilename = `archive-${archiveYearStr}-${archiveMonthStr}.txt`;
const archiveFilePath = path.join(pdfDir, archiveFilename);

let archiveContent = `# Archive for ${archiveYearStr}-${archiveMonthStr}\n`;
archiveContent += `# Total PDFs: ${monthlyPDFs.length}\n\n`;
monthlyPDFs.forEach(f => (archiveContent += f + "\n"));

write(archiveFilePath, archiveContent);
console.log(`Monthly archive written: ${archiveFilename}`);

// ---------------------------------------------------------
// 2) YEAR-ROLLOVER SECTION (RUNS ONLY IN JANUARY)
// AND ONLY ONCE PER YEAR
// ---------------------------------------------------------
if (mm === 1) {
  console.log("January detected — checking rollover lock…");

  if (fs.existsSync(rolloverLockPath)) {
    console.log(`Rollover for ${yyyy} already completed. Skipping rollover step.`);
  } else {
    console.log("Running YEAR rollover tasks…");

    // 2a) Backups
    backupFile(indexPath);
    backupFile(archivePath);

    // 2b) Extract LI lines from index2.html
    let indexHtml = read(indexPath);
    let liBlock = "";

    if (!indexHtml) {
      console.error("index2.html missing — rollover aborted.");
    } else {
      const ulPattern = /<ul[^>]*id=["']latest-warnings["'][^>]*>([\s\S]*?)<\/ul>/i;
      const match = indexHtml.match(ulPattern);

      if (match) {
        const inner = match[1];
        const lis = inner.match(/<li[\s\S]*?<\/li>/gi) || [];

        if (lis.length > 0) {
          liBlock = lis.join("\n");

          const newUl = match[0].replace(inner, "\n    ");
          indexHtml = indexHtml.replace(match[0], newUl);
          write(indexPath, indexHtml);

          console.log(`Extracted ${lis.length} LI entries and cleared current-year UL.`);
        }
      }
    }

    // 2c) Insert LI block into archive.html
    if (liBlock) {
      let archiveHtml = read(archivePath);

      if (!archiveHtml) {
        console.error("archive.html missing — cannot insert extracted LI block.");
      } else {
        const yearHeaderPattern = new RegExp(
          `(<h3[^>]*>\\s*<u>\\s*${archiveYearStr}\\s*ARCHIVE\\s*<\\/u>\\s*<\\/h3>\\s*)(<ul[^>]*>)([\\s\\S]*?)(<\\/ul>)`,
          "i"
        );

        const yearMatch = archiveHtml.match(yearHeaderPattern);

        if (yearMatch) {
          const existing = yearMatch[3];
          const newUlContent =
            `\n  ${liBlock}\n  ` + (existing.trim() ? existing : "") + "\n";

          const combined =
            yearMatch[1] + yearMatch[2] + newUlContent + yearMatch[4];

          archiveHtml = archiveHtml.replace(yearMatch[0], combined);
          write(archivePath, archiveHtml);

          console.log(
            `Inserted ${liBlock.split(/<li/).length - 1} entries into ${archiveYearStr} archive.`
          );
        } else {
          console.warn(`No section for ${archiveYearStr} — creating one.`);

          const newSection = `
<h3 class="section-title"><u>${archiveYearStr} ARCHIVE</u></h3>
<ul>
  ${liBlock}
</ul>
`;

          const bodyClose = archiveHtml.lastIndexOf("</body>");
          if (bodyClose !== -1) {
            archiveHtml =
              archiveHtml.slice(0, bodyClose) +
              newSection +
              archiveHtml.slice(bodyClose);
          } else {
            archiveHtml += newSection;
          }

          write(archivePath, archiveHtml);
          console.log(`Created ${archiveYearStr} section and inserted rollover entries.`);
        }
      }
    }

    // 2d) Ensure new-year section exists
    const newYear = String(yyyy);
    let archiveHtmlNow = read(archivePath);

    if (archiveHtmlNow) {
      const newYearPattern = new RegExp(
        `<h3[^>]*>\\s*<u>\\s*${newYear}\\s*ARCHIVE`,
        "i"
      );

      if (!archiveHtmlNow.match(newYearPattern)) {
        const addition = `
<h3 class="section-title"><u>${newYear} ARCHIVE</u></h3>
<ul>
  <!-- AUTOMATION WILL INSERT ENTRIES HERE -->
</ul>
`;

        const bodyClose = archiveHtmlNow.lastIndexOf("</body>");
        if (bodyClose !== -1) {
          archiveHtmlNow =
            archiveHtmlNow.slice(0, bodyClose) +
            addition +
            archiveHtmlNow.slice(bodyClose);
        } else {
          archiveHtmlNow += addition;
        }

        write(archivePath, archiveHtmlNow);
        console.log(`Added empty ${newYear} ARCHIVE section.`);
      }
    }

    // 2e) Ensure yearly folder exists
    const newWarningFolder = path.join(root, `warning${yyyy}`);

    if (!fs.existsSync(newWarningFolder)) {
      fs.mkdirSync(newWarningFolder);
      write(path.join(newWarningFolder, ".nomedia"), "");
      console.log(`Created warning${yyyy}/ with .nomedia file.`);
    }

    // ---------------------------------------------------------
    // WRITE THE YEAR-SPECIFIC ROLLOVER LOCK (SUCCESS ONLY)
    // ---------------------------------------------------------
    fs.writeFileSync(rolloverLockPath, "OK", "utf8");
    console.log(`Rollover hard lock created: rollover-${yyyy}.lock`);
  }
}

// ---------------------------------------------------------
console.log("Monthly script finished successfully.");
