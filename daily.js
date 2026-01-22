import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generate } from "@pdfme/generator";
import cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const HTML_DIR = ROOT;
const OUTPUT_DIR = path.join(ROOT, "PDFS");
const TEMPLATE_DIR = path.join(ROOT, "TEMPLATES");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF_PATH = path.join(TEMPLATE_DIR, "blank.pdf");

console.log("▶ DAILY RUN START");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/* ---------- HARD REQUIREMENTS ---------- */
const BASE_PDF = fs.readFileSync(BASE_PDF_PATH);
const SWANSEA_FONT = fs.readFileSync(FONT_PATH);

/* sanity check (leave in) */
if (!BASE_PDF.slice(0, 4).toString().startsWith("%PDF")) {
  throw new Error("basePdf is NOT a valid PDF");
}

/* ---------- HTML FILES ---------- */
const htmlFiles = fs
  .readdirSync(HTML_DIR)
  .filter(f => f.endsWith(".html"));

let generated = 0;

for (const file of htmlFiles) {
  console.log(`➡ Processing ${file}`);

  const html = fs.readFileSync(path.join(HTML_DIR, file), "utf8").trim();
  if (!html) {
    console.warn(`⚠ Skipped (empty): ${file}`);
    continue;
  }

  try {
    const $ = cheerio.load(html);
    const text = $("body").text().trim();

    if (!text) {
      console.warn(`⚠ Skipped (no body text): ${file}`);
      continue;
    }

    const pdf = await generate({
      template: {
        basePdf: BASE_PDF,
        schemas: [
          {
            content: {
              type: "text",
              position: { x: 20, y: 20 },
              width: 170,
              height: 260,
              fontSize: 11,
              fontName: "Swansea"
            }
          }
        ]
      },
      inputs: [
        {
          content: text
        }
      ],
      options: {
        font: {
          Swansea: {
            data: SWANSEA_FONT
          }
        }
      }
    });

    const outName = file.replace(".html", ".pdf");
    fs.writeFileSync(path.join(OUTPUT_DIR, outName), pdf);

    console.log(`✅ Generated ${outName}`);
    generated++;

  } catch (err) {
    console.error(`❌ Failed: ${file} [${err.message}]`);
  }
}

console.log(`📄 PDFs generated: ${generated}`);

if (generated === 0) {
  console.error("❌ No PDFs generated");
  process.exit(1);
}
