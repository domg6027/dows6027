import fs from "fs";
import path from "path";
import process from "process";

import pdfme from "@pdfme/common";

const { generate } = pdfme;

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "data.json");
const OUTPUT_DIR = path.join(ROOT, "output");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

console.log("\n▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

/* -------------------- HARD FAILSAFES -------------------- */

if (!fs.existsSync(DATA_FILE)) {
  console.error("❌ data.json missing — REFUSING TO RUN");
  process.exit(1);
}

if (!fs.existsSync(FONT_PATH)) {
  console.error("❌ Swansea font missing — REFUSING TO RUN");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch {
  console.error("❌ data.json corrupt — REFUSING TO RUN");
  process.exit(1);
}

if (
  typeof data.last_article_number !== "number" ||
  !data.last_date_used
) {
  console.error("❌ data.json fields invalid — REFUSING TO RUN");
  process.exit(1);
}

/* -------------------- FONT REGISTRATION -------------------- */

const fonts = {
  Swansea: {
    data: fs.readFileSync(FONT_PATH),
    fallback: true
  }
};

/* -------------------- OUTPUT DIR -------------------- */

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/* -------------------- ARTICLE IDS (ALREADY DISCOVERED) -------------------- */
/* NOTE: This script assumes your article discovery logic already ran */

const articleIds = globalThis.NEW_ARTICLE_IDS;

if (!Array.isArray(articleIds) || articleIds.length === 0) {
  console.log("ℹ No new articles — exiting cleanly");
  process.exit(0);
}

console.log(`📰 New articles found: ${articleIds.length}`);

let generatedCount = 0;
let highestId = data.last_article_number;

/* -------------------- PDF GENERATION -------------------- */

for (const id of articleIds) {
  console.log(`➡ Processing ${id}`);

  const template = {
    basePdf: null,
    schemas: [[
      {
        content: {
          type: "text",
          position: { x: 20, y: 20 },
          width: 170,
          height: 260,
          fontSize: 12,
          fontName: "Swansea"
        }
      }
    ]]
  };

  const inputs = [{
    content: `Article ${id}`
  }];

  let pdf;
  try {
    pdf = await generate({
      template,
      inputs,
      options: { font: fonts }
    });
  } catch (err) {
    console.error(`❌ PDF generation failed for ${id}`);
    continue;
  }

  if (!pdf || pdf.length === 0) {
    console.error(`❌ Empty PDF buffer for ${id}`);
    continue;
  }

  const outPath = path.join(OUTPUT_DIR, `${id}.pdf`);
  fs.writeFileSync(outPath, pdf);

  generatedCount++;
  if (id > highestId) highestId = id;
}

/* -------------------- FINAL VALIDATION -------------------- */

if (generatedCount === 0) {
  console.error("❌ NO PDFs GENERATED — HARD FAIL");
  process.exit(1);
}

/* -------------------- SAFE DATA UPDATE -------------------- */

data.last_article_number = highestId;
data.current_date = new Date().toISOString().slice(0, 10);

fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

console.log(`✅ PDFs generated: ${generatedCount}`);
console.log("▶ DAILY RUN COMPLETE\n");
