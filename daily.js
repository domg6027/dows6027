/**
 * DOWS6027 – DAILY RUN (FINAL, STABLE)
 * Node 20 • ESM • GitHub Actions SAFE
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

import pdfmeGenerator from "@pdfme/generator";
import pdfmeCommon from "@pdfme/common";

const { generate } = pdfmeGenerator;
const { Font } = pdfmeCommon;

/* ---------------- PATHS ---------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const PDF_DIR = path.join(ROOT, "PDFS");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });

if (!fs.existsSync(FONT_PATH)) {
  console.error("❌ Font missing:", FONT_PATH);
  process.exit(1);
}

/* ---------------- FONT ---------------- */

const font = new Font({
  Swansea: fs.readFileSync(FONT_PATH)
});

/* ---------------- HTML INPUT ---------------- */

const htmlFiles = fs
  .readdirSync(ROOT)
  .filter(f => f.endsWith(".html"));

if (!htmlFiles.length) {
  console.error("❌ No HTML files found");
  process.exit(1);
}

console.log("▶ DAILY RUN START");

/* ---------------- MAIN ---------------- */

let generated = 0;

for (const file of htmlFiles) {
  console.log("➡ Processing", file);

  try {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const text = document.body.textContent
      .replace(/\s+/g, " ")
      .trim();

    if (!text || text.length < 100) {
      console.warn("⚠ Skipped (empty):", file);
      continue;
    }

    const pdf = await generate({
      template: {
        basePdf: null,
        schemas: [
          {
            body: {
              type: "text",
              position: { x: 20, y: 20 },
              width: 170,
              height: 260,
              fontSize: 11
            }
          }
        ]
      },
      inputs: [{ body: text }],
      options: { font }
    });

    const out = path.join(PDF_DIR, file.replace(".html", ".pdf"));
    fs.writeFileSync(out, pdf);

    console.log("✔ PDF written:", path.basename(out));
    generated++;

  } catch (err) {
    console.error("❌ Failed:", file, err.message);
  }
}

console.log("📄 PDFs generated:", generated);

if (!generated) {
  console.error("❌ No PDFs generated");
  process.exit(1);
}

console.log("✔ DAILY RUN COMPLETE");
