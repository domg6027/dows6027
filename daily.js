import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import * as cheerio from "cheerio";
import { generate } from "@pdfme/generator";

// -------------------------
// ENV SETUP
// -------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const PDF_DIR = path.join(ROOT, "PDFS");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF_PATH = path.join(ROOT, "blank.pdf");

// -------------------------
// SAFETY CHECKS
// -------------------------
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR);

if (!fs.existsSync(FONT_PATH)) {
  throw new Error("Missing font file: fonts/Swansea-q3pd.ttf");
}

if (!fs.existsSync(BASE_PDF_PATH)) {
  throw new Error("Missing base PDF: blank.pdf");
}

// -------------------------
// LOAD ASSETS
// -------------------------
const BASE_PDF = fs.readFileSync(BASE_PDF_PATH);
const SWANSEA_FONT = fs.readFileSync(FONT_PATH);

// -------------------------
// HTML → TEXT
// -------------------------
function extractText(html) {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

// -------------------------
// HTML → PDF TEMPLATE
// -------------------------
function buildTemplate(text) {
  return {
    basePdf: BASE_PDF,
    schemas: [
      {
        body: {
          type: "text",
          position: { x: 20, y: 20 },
          width: 170,
          height: 260,
          fontSize: 11,
          fontName: "Swansea",
        },
      },
    ],
  };
}

// -------------------------
// MAIN
// -------------------------
async function run() {
  console.log("▶ DAILY RUN START");

  const htmlFiles = fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith(".html"));

  let generated = 0;

  for (const file of htmlFiles) {
    try {
      console.log(`➡ Processing ${file}`);

      const html = fs.readFileSync(path.join(ROOT, file), "utf8");
      const text = extractText(html);

      if (!text) {
        console.warn(`⚠ Skipped (empty): ${file}`);
        continue;
      }

      const template = buildTemplate(text);

      const pdf = await generate({
        template,
        inputs: [{ body: text }],
        options: {
          font: {
            Swansea: {
              data: SWANSEA_FONT,
              fallback: true, // 🔥 REQUIRED
            },
          },
        },
      });

      const outName = file.replace(".html", ".pdf");
      fs.writeFileSync(path.join(PDF_DIR, outName), pdf);

      console.log(`✅ Generated ${outName}`);
      generated++;
    } catch (err) {
      console.error(`❌ Failed: ${file}`);
      console.error(err.message || err);
    }
  }

  console.log(`📄 PDFs generated: ${generated}`);

  if (generated === 0) {
    throw new Error("No PDFs generated");
  }
}

run();
