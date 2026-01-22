import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cheerio from "cheerio";
import { generate } from "@pdfme/generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARCHIVE_URL = "https://www.prophecynewswatch.com/archive.cfm";
const ARTICLE_BASE = "https://www.prophecynewswatch.com/article.cfm?recent_news_id=";

const PDF_DIR = path.join(__dirname, "PDFS");
const TMP_DIR = path.join(__dirname, "TMP");
const FONT_PATH = path.join(__dirname, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF = path.join(__dirname, "TEMPLATES", "blank.pdf");

console.log("▶ DAILY RUN START");

// --- sanity checks ---
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR);
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

if (!fs.existsSync(FONT_PATH)) {
  throw new Error("Missing font: fonts/Swansea-q3pd.ttf");
}

if (!fs.existsSync(BASE_PDF)) {
  throw new Error("Missing base PDF: TEMPLATES/blank.pdf");
}

// --- font config (ONE fallback only) ---
const fonts = {
  Swansea: {
    data: fs.readFileSync(FONT_PATH),
    fallback: true
  }
};

// --- helpers ---
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.text();
}

function extractIds(html) {
  const $ = cheerio.load(html);
  const ids = new Set();

  $("a[href*='recent_news_id=']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/recent_news_id=(\d+)/);
    if (match) ids.add(match[1]);
  });

  return [...ids].sort((a, b) => Number(a) - Number(b));
}

function extractArticle(html) {
  const $ = cheerio.load(html);

  // Main article container used by PNW
  const article = $("td[width='100%']").first();

  article.find("script, style, iframe").remove();

  const text = article.text().trim();
  if (!text) return null;

  return text;
}

// --- main ---
const archiveHtml = await fetchText(ARCHIVE_URL);
const articleIds = extractIds(archiveHtml);

console.log(`➡ Found ${articleIds.length} articles in archive`);

let generated = 0;

for (const id of articleIds) {
  const pdfPath = path.join(PDF_DIR, `${id}.pdf`);
  if (fs.existsSync(pdfPath)) continue;

  console.log(`➡ Processing article ${id}`);

  try {
    const articleHtml = await fetchText(`${ARTICLE_BASE}${id}`);
    fs.writeFileSync(path.join(TMP_DIR, `${id}.html`), articleHtml);

    const content = extractArticle(articleHtml);
    if (!content) {
      console.warn(`⚠ Skipped (empty): ${id}`);
      continue;
    }

    const template = {
      basePdf: fs.readFileSync(BASE_PDF),
      schemas: [
        [
          {
            name: "body",
            type: "text",
            content,
            position: { x: 20, y: 20 },
            width: 170,
            height: 260,
            fontName: "Swansea",
            fontSize: 10
          }
        ]
      ]
    };

    const pdf = await generate({
      template,
      inputs: [{}],
      options: { font: fonts }
    });

    fs.writeFileSync(pdfPath, pdf);
    generated++;
  } catch (err) {
    console.error(`❌ Failed ${id}:`, err.message);
  }
}

console.log(`📄 PDFs generated: ${generated}`);

if (generated === 0) {
  console.log("ℹ️ No new articles to process");
}
