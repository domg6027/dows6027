// onepdf.js
// Processes exactly ONE article safely

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generate } from "@pdfme/generator";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "data.json");
const PDF_DIR = path.join(__dirname, "PDFS");
const TEMPLATE_DIR = path.join(__dirname, "TEMPLATES");
const BLANK_PDF = path.join(TEMPLATE_DIR, "blank.pdf");

const BASE_URL =
  "https://www.prophecynewswatch.com/article.cfm?recent_news_id=";

function log(msg) {
  console.log(msg);
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadPNWTemplates() {
  return fs
    .readdirSync(TEMPLATE_DIR)
    .filter((f) => /^PNW\d+\.txt$/i.test(f))
    .map((f) =>
      fs.readFileSync(path.join(TEMPLATE_DIR, f), "utf-8").trim()
    );
}

function extractBody(html, templates) {
  for (const marker of templates) {
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      return html.substring(idx);
    }
  }
  return null;
}

async function fetchArticle(articleNumber) {
  const res = await fetch(`${BASE_URL}${articleNumber}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function createPDF(articleNumber, html) {
  if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR);

  const outputPath = path.join(PDF_DIR, `${articleNumber}.pdf`);
  const templatePdf = await readFile(BLANK_PDF);

  await generate({
    template: templatePdf,
    inputs: [
      {
        html,
      },
    ],
    options: {
      outputType: "file",
      fileName: outputPath,
    },
  });

  return fs.existsSync(outputPath);
}

async function main() {
  log("▶ onepdf.js start");

  const data = loadData();
  let articleNumber = data.last_article_number + 1;

  const templates = loadPNWTemplates();
  if (templates.length === 0) {
    throw new Error("No PNW templates found");
  }

  while (true) {
    log(`➡ Trying article ${articleNumber}`);

    const html = await fetchArticle(articleNumber);
    if (!html) {
      log(`⚠ 404 skipped: ${articleNumber}`);
      articleNumber++;
      continue;
    }

    const bodyHTML = extractBody(html, templates);
    if (!bodyHTML) {
      throw new Error(`No article body detected for ${articleNumber}`);
    }

    const ok = await createPDF(articleNumber, bodyHTML);
    if (!ok) {
      throw new Error(`PDF not created for ${articleNumber}`);
    }

    // ✅ ONLY NOW update data.json
    data.last_article_number = articleNumber;
    data.last_URL_processed = `${BASE_URL}${articleNumber}`;
    data.current_date = new Date().toISOString().slice(0, 10);

    saveData(data);

    log(`✅ Committed PDF ${articleNumber}`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("❌ onepdf.js failed:", err.message);
  process.exit(1);
});
