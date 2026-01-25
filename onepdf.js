/**
 * DOWS6027 – ONEPDF WORKER (HARDENED + CHUNKED)
 * Fetch → PDF → VERIFY → GIT COMMIT → UPDATE data.json
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

/* -------------------- GUARDS -------------------- */

if (!fs.existsSync(DATA_FILE)) throw new Error("Missing data.json");
if (!fs.existsSync(FONT_PATH)) throw new Error("Missing font");
if (!fs.existsSync(BASE_PDF)) throw new Error("Missing blank.pdf");

/* -------------------- HELPERS -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => {
          if (res.statusCode === 302 || res.statusCode === 404) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(data);
          }
        });
      })
      .on("error", reject);
  });
}

function splitText(text, max = 2000) {
  const chunks = [];
  let buf = "";

  for (const word of text.split(" ")) {
    if ((buf + " " + word).length > max) {
      chunks.push(buf.trim());
      buf = word;
    } else {
      buf += " " + word;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/* -------------------- MAIN -------------------- */

(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let id = state.last_article_number + 1;

  while (true) {
    console.log("➡ Trying article", id);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      console.warn("⚠ Skipped (404/302):", id);
      id++;
      continue;
    }

    const $ = cheerio.load(html);
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    if (bodyText.length < 500) {
      console.warn("⚠ Skipped (too small):", id);
      id++;
      continue;
    }

    const chunks = splitText(bodyText);

    const schemas = chunks.map((_, i) => ({
      [`body_${i}`]: {
        type: "text",
        position: { x: 20, y: 20 },
        width: 170,
        height: 260,
        fontSize: 11
      }
    }));

    const inputs = [
      Object.fromEntries(chunks.map((c, i) => [`body_${i}`, c]))
    ];

    const pdf = await generate({
      template: {
        basePdf: fs.readFileSync(BASE_PDF),
        schemas
      },
      inputs,
      options: {
        font: {
          Swansea: {
            data: fs.readFileSync(FONT_PATH),
            fallback: true
          }
        }
      }
    });

    const outPath = path.join(PDF_DIR, `${id}.pdf`);
    fs.writeFileSync(outPath, pdf);

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1000) {
      throw new Error("PDF generation failed silently");
    }

    /* ---- COMMIT PDF FIRST ---- */

    execSync(`git add PDFS/${id}.pdf`);
    execSync(`git commit -m "Add PNW article ${id}"`);

    /* ---- UPDATE STATE ONLY AFTER PDF EXISTS ---- */

    state.last_article_number = id;
    state.last_URL_processed =
      `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;

    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    execSync("git add data.json");
    execSync(`git commit -m "Update state after article ${id}"`);

    console.log(`✔ Article ${id} committed`);
    return; // ONE PDF ONLY – daily.js loops
  }
})();
