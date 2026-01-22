import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generate } from "@pdfme/generator";
import pkg from "@pdfme/common";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const HTML_DIR = ROOT;
const PDF_DIR = path.join(ROOT, "PDFS");
const TEMPLATE_DIR = path.join(ROOT, "TEMPLATES");

const BASE_PDF_PATH = path.join(TEMPLATE_DIR, "blank.pdf");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

if (!fs.existsSync(BASE_PDF_PATH)) {
  throw new Error(`Missing base PDF: ${BASE_PDF_PATH}`);
}
if (!fs.existsSync(FONT_PATH)) {
  throw new Error(`Missing font file: ${FONT_PATH}`);
}

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

const fontData = fs.readFileSync(FONT_PATH);

const fonts = {
  Swansea: {
    data: fontData,
    fallback: true,
  },
};

console.log("▶ DAILY RUN START");

let generated = 0;

const htmlFiles = fs
  .readdirSync(HTML_DIR)
  .filter((f) => f.endsWith(".html"));

for (const file of htmlFiles) {
  const filePath = path.join(HTML_DIR, file);
  console.log(`➡ Processing ${file}`);

  try {
    const html = fs.readFileSync(filePath, "utf8").trim();
    if (!html) {
      console.warn(`⚠ Skipped (empty): ${file}`);
      continue;
    }

    const $ = cheerio.load(html);
    const text = $("body").text().trim();

    if (!text) {
      console.warn(`⚠ Skipped (no body text): ${file}`);
      continue;
    }

    const template = {
      basePdf: fs.readFileSync(BASE_PDF_PATH),
      schemas: [
        {
          content: {
            type: "text",
            position: { x: 20, y: 20 },
            width: 170,
            height: 260,
            fontName: "Swansea",
            fontSize: 11,
          },
        },
      ],
    };

    const inputs = [
      {
        content: text,
      },
    ];

    const pdf = await generate({
      template,
      inputs,
      options: { font: fonts },
    });

    const outPath = path.join(
      PDF_DIR,
      file.replace(".html", ".pdf")
    );

    fs.writeFileSync(outPath, pdf);

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
