/**
 * onepdf.js
 * Generates EXACTLY ONE PNW PDF safely and commits it with state
 * Node 20 – ES Module – GitHub Actions safe
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import * as cheerio from "cheerio";
import { generate } from "@pdfme/generator";

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "data.json");
const PDF_DIR = path.join(ROOT, "PDFS");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

fs.mkdirSync(PDF_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  throw new Error("Missing ROOT data.json");
}

/* -------------------- NETWORK -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: { "User-Agent": "Mozilla/5.0" },
          followAllRedirects: false
        },
        res => {
          if (res.statusCode === 302 || res.statusCode === 404) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = "";
          res.on("data", d => (data += d));
          res.on("end", () => resolve(data));
        }
      )
      .on("error", reject);
  });
}

/* -------------------- MAIN -------------------- */

(async () => {
  console.log("▶ onepdf.js start");

  let state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let article = state.last_article_number + 1;

  while (true) {
    console.log("➡ Trying article", article);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${article}`
      );
    } catch {
      console.warn("⚠ Skipped (404/302):", article);
      article++;
      continue;
    }

    const $ = cheerio.load(html);
    const body = $("#content").text().replace(/\s+/g, " ").trim();

    if (body.length < 500) {
      console.warn("⚠ Skipped (empty body):", article);
      article++;
      continue;
    }

    const pdfPath = path.join(PDF_DIR, `${article}.pdf`);

    const pdf = await generate({
      template: {
        basePdf: fs.readFileSync(BASE_PDF),
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
      inputs: [{ body }],
      options: {
        font: {
          Swansea: {
            data: fs.readFileSync(FONT_PATH),
            fallback: true
          }
        }
      }
    });

    fs.writeFileSync(pdfPath, pdf);

    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF write failed – aborting");
    }

    /* ---- UPDATE ROOT STATE ---- */

    state.last_article_number = article;
    state.last_URL_processed =
      `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${article}`;
    state.current_date = new Date().toISOString().slice(0, 10);

    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

    /* ---- COMMIT BOTH PDF + STATE ---- */

    execSync("git add PDFS data.json", { stdio: "inherit" });
    execSync(
      `git commit -m "Add PNW article ${article}"`,
      { stdio: "inherit" }
    );

    console.log(`✔ Article ${article} committed`);
    process.exit(0);
  }
})();
