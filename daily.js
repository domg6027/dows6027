import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { generate } from "@pdfme/generator";
import { Font } from "@pdfme/common";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const PDF_DIR = path.join(ROOT, "PDFS");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR);
}

console.log("▶ DAILY RUN START");

const htmlFiles = fs
  .readdirSync(ROOT)
  .filter(
    (f) =>
      f.endsWith(".html") &&
      !["header.html", "footer.html", "nav.html"].includes(f)
  );

let generated = 0;

const font = new Font({
  Swansea: fs.readFileSync(FONT_PATH),
});

for (const file of htmlFiles) {
  try {
    console.log(`➡ Processing ${file}`);

    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const bodyText = document.body.textContent?.trim();

    if (!bodyText) {
      console.warn(`⚠ No body content: ${file}`);
      continue;
    }

    const pdf = await generate({
      template: {
        basePdf: null,
        schemas: [
          {
            content: {
              type: "text",
              position: { x: 20, y: 20 },
              width: 170,
              height: 260,
              fontName: "Swansea",
              fontSize: 12,
            },
          },
        ],
      },
      inputs: [{ content: bodyText }],
      options: { font },
    });

    const out = path.join(
      PDF_DIR,
      file.replace(".html", ".pdf")
    );

    fs.writeFileSync(out, pdf);
    generated++;
  } catch (err) {
    console.error(`❌ Failed: ${file}`);
    console.error(err);
  }
}

console.log(`📄 PDFs generated: ${generated}`);

if (generated === 0) {
  console.error("❌ No PDFs generated");
  process.exit(1);
}

console.log("✔ DAILY RUN COMPLETE");
