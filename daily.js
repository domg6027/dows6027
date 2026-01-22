// daily.js — FINAL ESM-SAFE VERSION (Node 20+)

import fs from "fs";
import path from "path";
import https from "https";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";

// ---- CommonJS interop (REQUIRED) ----
import pdfmeCommon from "@pdfme/common";
const { createPdf } = pdfmeCommon;

// ---- ESM dirname fix ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- CONFIG ----
const SOURCE_DIR = path.join(__dirname, "HTML");
const OUTPUT_DIR = path.join(__dirname, "PDFS");
const FONT_PATH = path.join(__dirname, "fonts", "Roboto-Regular.ttf");

// Ensure output dir exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ---- HELPERS ----
function readHtml(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractContent(html) {
  const $ = cheerio.load(html);

  // Priority order:
  // 1. <section data-davar-lechem>
  // 2. <section>
  // 3. <article>
  // 4. <body>
  // 5. full document fallback

  let container =
    $("section[data-davar-lechem]").first().html() ||
    $("section").first().html() ||
    $("article").first().html() ||
    $("body").html() ||
    html;

  return container.trim();
}

function htmlToPlainText(html) {
  const $ = cheerio.load(html);
  return $.text().replace(/\n\s*\n/g, "\n\n").trim();
}

// ---- PDF TEMPLATE ----
function buildPdfTemplate(text) {
  return {
    basePdf: {
      width: 595,
      height: 842,
      padding: [40, 40, 40, 40],
    },
    schemas: [
      {
        content: {
          type: "text",
          position: { x: 0, y: 0 },
          width: 515,
          height: 760,
          fontSize: 11,
          lineHeight: 1.4,
        },
      },
    ],
    fonts: {
      Roboto: {
        data: fs.readFileSync(FONT_PATH),
        fallback: true,
      },
    },
  };
}

// ---- MAIN ----
async function run() {
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith(".html"));

  if (!files.length) {
    console.log("No HTML files found.");
    return;
  }

  for (const file of files) {
    try {
      const inputPath = path.join(SOURCE_DIR, file);
      const rawHtml = readHtml(inputPath);

      const extractedHtml = extractContent(rawHtml);
      const plainText = htmlToPlainText(extractedHtml);

      const template = buildPdfTemplate(plainText);

      const pdf = await createPdf({
        template,
        inputs: [{ content: plainText }],
      });

      const outName = file.replace(/\.html$/, ".pdf");
      const outPath = path.join(OUTPUT_DIR, outName);

      fs.writeFileSync(outPath, pdf);

      console.log(`✔ Generated PDF: ${outName}`);
    } catch (err) {
      console.error(`✖ Failed processing ${file}`);
      console.error(err);
      process.exitCode = 1;
    }
  }
}

// ---- EXECUTE ----
run();
