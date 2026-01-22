// daily.js — FINAL WORKFLOW VERSION (Node 20 / ESM)

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";

// ---- pdfme CommonJS interop (CORRECT) ----
import pdfmePkg from "@pdfme/common";
const { createPdf } = pdfmePkg;

// ---- ESM dirname ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- PATHS (LOCKED TO YOUR SETUP) ----
const ROOT = __dirname;
const OUTPUT_DIR = path.join(ROOT, "PDFS");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

// ---- Ensure PDF output ----
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ---- HTML DETECTION ----
function findHtmlFiles() {
  return fs
    .readdirSync(ROOT)
    .filter(f => f.endsWith(".html"));
}

// ---- CONTENT EXTRACTION (ALL 3 VERSIONS) ----
function extractContent(html) {
  const $ = cheerio.load(html);

  return (
    $("section[data-davar-lechem]").first().html() ||
    $("section").first().html() ||
    $("article").first().html() ||
    $("body").html() ||
    html
  ).trim();
}

// ---- TEXT NORMALIZATION ----
function htmlToText(html) {
  const $ = cheerio.load(html);
  return $.text().replace(/\n\s*\n+/g, "\n\n").trim();
}

// ---- PDF TEMPLATE ----
function buildTemplate(text) {
  return {
    basePdf: { width: 595, height: 842, padding: [40, 40, 40, 40] },
    schemas: [{
      content: {
        type: "text",
        position: { x: 0, y: 0 },
        width: 515,
        height: 760,
        fontSize: 11,
        lineHeight: 1.4,
      }
    }],
    fonts: {
      Swansea: {
        data: fs.readFileSync(FONT_PATH),
        fallback: true
      }
    }
  };
}

// ---- MAIN RUNNER ----
async function run() {
  console.log("▶ DAILY RUN START");

  const htmlFiles = findHtmlFiles();

  if (!htmlFiles.length) {
    console.log("⚠ No HTML files found in ROOT");
    process.exit(0);
  }

  let generated = 0;

  for (const file of htmlFiles) {
    try {
      console.log(`➡ Processing ${file}`);

      const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
      const extracted = extractContent(raw);
      const text = htmlToText(extracted);

      if (!text) {
        console.log(`⚠ No article body: ${file}`);
        continue;
      }

      const template = buildTemplate(text);

      const pdf = await createPdf({
        template,
        inputs: [{ content: text }]
      });

      const out = file.replace(/\.html$/, ".pdf");
      fs.writeFileSync(path.join(OUTPUT_DIR, out), pdf);

      console.log(`✔ PDF generated: ${out}`);
      generated++;

    } catch (err) {
      console.error(`❌ Failed: ${file}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  console.log(`📄 PDFs generated: ${generated}`);

  if (generated === 0) {
    console.error("❌ No PDFs generated");
    process.exit(1);
  }

  console.log("✔ DAILY RUN COMPLETE");
}

// ---- EXEC ----
run();
