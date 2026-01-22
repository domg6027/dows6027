import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";

import pkgCommon from "@pdfme/common";
import pkgGenerator from "@pdfme/generator";

const { generate } = pkgGenerator;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================= CONFIG ================= */

const ARCHIVE_URL = "https://www.prophecynewswatch.com/archive.cfm";

const PDF_DIR = path.join(__dirname, "PDFS");
const FONT_PATH = path.join(__dirname, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF = path.join(__dirname, "TEMPLATES", "blank.pdf");

/* ================= SANITY ================= */

if (!fs.existsSync(BASE_PDF)) {
  throw new Error("Missing base PDF: TEMPLATES/blank.pdf");
}

if (!fs.existsSync(FONT_PATH)) {
  throw new Error("Missing font: fonts/Swansea-q3pd.ttf");
}

fs.mkdirSync(PDF_DIR, { recursive: true });

/* ================= HELPERS ================= */

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return await res.text();
}

/**
 * Heuristic extractor:
 * - works across ALL known PNW article variants
 * - ignores brittle selectors
 */
function extractArticle(html) {
  const $ = cheerio.load(html);

  $("script, style, iframe, nav, form").remove();

  let best = "";
  let bestLen = 0;

  $("td, div").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > bestLen && text.length > 1200) {
      best = text;
      bestLen = text.length;
    }
  });

  return best || null;
}

/* ================= MAIN ================= */

async function run() {
  console.log("▶ DAILY RUN START");

  const archiveHtml = await fetchText(ARCHIVE_URL);
  const $ = cheerio.load(archiveHtml);

  const articleIds = new Set();

  $("a[href*='article.cfm?recent_news_id=']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href.match(/recent_news_id=(\d+)/);
    if (match) articleIds.add(match[1]);
  });

  console.log(`➡ Found ${articleIds.size} articles in archive`);

  let generated = 0;

  for (const id of articleIds) {
    console.log(`➡ Processing article ${id}`);

    const outFile = path.join(PDF_DIR, `${id}.pdf`);
    if (fs.existsSync(outFile)) {
      console.log(`ℹ️ Already exists: ${id}`);
      continue;
    }

    try {
      const url = `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;
      const html = await fetchText(url);

      const articleText = extractArticle(html);
      if (!articleText) {
        console.warn(`⚠ Skipped (empty): ${id}`);
        continue;
      }

      const fontData = fs.readFileSync(FONT_PATH);

      const template = {
        basePdf: fs.readFileSync(BASE_PDF),
        schemas: [
          [
            {
              name: "content",
              type: "text",
              position: { x: 20, y: 20 },
              width: 170,
              height: 250,
              fontName: "Swansea",
              fontSize: 11,
              lineHeight: 1.3,
            },
          ],
        ],
      };

      const inputs = [{ content: articleText }];

      const pdf = await generate({
        template,
        inputs,
        options: {
          font: {
            Swansea: {
              data: fontData,
              fallback: true,
            },
          },
        },
      });

      fs.writeFileSync(outFile, pdf);
      generated++;
    } catch (err) {
      console.error(`❌ Failed: ${id}`);
      console.error(err.message || err);
    }
  }

  console.log(`📄 PDFs generated: ${generated}`);

  if (generated === 0) {
    console.log("ℹ️ No new articles to process");
    process.exit(1);
  }
}

run();
