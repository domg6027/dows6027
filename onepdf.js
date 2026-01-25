/**
 * DOWS6027 – ONEPDF WORKER
 * Processes EXACTLY ONE valid PNW article per run
 * Order: FETCH → PDF → COMMIT PDF → UPDATE data.json → EXIT
 * Node 20 – ES Module
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import { generate } from "@pdfme/generator";

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");
const FONT_FILE = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");

fs.mkdirSync(PDF_DIR, { recursive: true });

/* -------------------- GUARDS -------------------- */

if (!fs.existsSync(DATA_FILE)) throw new Error("Missing data.json");
if (!fs.existsSync(BASE_PDF)) throw new Error("Missing TEMPLATES/blank.pdf");
if (!fs.existsSync(FONT_FILE)) throw new Error("Missing font file");

/* -------------------- HELPERS -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => {
          if (res.statusCode === 404 || res.statusCode === 302) {
            resolve({ status: res.statusCode });
          } else if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve({ status: 200, html: data });
          }
        });
      })
      .on("error", reject);
  });
}

function splitText(text, size = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/* -------------------- MAIN -------------------- */

(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let id = state.last_article_number + 1;

  while (true) {
    console.log("➡ Trying article", id);

    const url =
      `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;

    let response;
    try {
      response = await fetch(url);
    } catch (e) {
      console.error("❌ Network error:", e.message);
      process.exit(1);
    }

    /* ---- Skip deleted / redirected articles ---- */
    if (response.status === 404 || response.status === 302) {
      console.warn("⚠ Skipped (HTTP " + response.status + "):", id);
      id++;
      continue;
    }

    const html = response.html;

    if (!html || html.length < 500) {
      console.warn("⚠ Skipped (empty HTML):", id);
      id++;
      continue;
    }

    /* ---- Convert FULL HTML (ads included) ---- */

    const cleanHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = splitText(cleanHtml, 2000);

    if (!chunks.length) {
      console.warn("⚠ Skipped (no chunks):", id);
      id++;
      continue;
    }

    /* ---- PDF GENERATION ---- */

    let pdf;
    try {
      pdf = await generate({
        template: {
          basePdf: fs.readFileSync(BASE_PDF),
          schemas: chunks.map((_, i) => ({
            [`p${i}`]: {
              type: "text",
              position: { x: 20, y: 20 },
              width: 170,
              height: 260,
              fontSize: 10
            }
          }))
        },
        inputs: [
          Object.fromEntries(
            chunks.map((t, i) => [`p${i}`, t])
          )
        ],
        options: {
          font: {
            Swansea: {
              data: fs.readFileSync(FONT_FILE),
              fallback: true
            }
          }
        }
      });
    } catch (e) {
      console.error("❌ PDF generation failed:", e.message);
      process.exit(1);
    }

    const pdfPath = path.join(PDF_DIR, `${id}.pdf`);
    fs.writeFileSync(pdfPath, pdf);

    if (!fs.existsSync(pdfPath)) {
      console.error("❌ PDF not written:", id);
      process.exit(1);
    }

    /* ---- GIT COMMIT PDF FIRST ---- */

    try {
      execSync(`git add PDFS/${id}.pdf`, { stdio: "ignore" });
      execSync(`git commit -m "Add PNW article ${id}"`, {
        stdio: "ignore"
      });
    } catch (e) {
      console.error("❌ Git commit failed for PDF:", id);
      process.exit(1);
    }

    /* ---- UPDATE data.json ONLY AFTER PDF EXISTS & COMMITTED ---- */

    state.last_article_number = id;
    state.last_URL_processed = url;

    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

    try {
      execSync(`git add data.json`, { stdio: "ignore" });
      execSync(`git commit -m "Update state after article ${id}"`, {
        stdio: "ignore"
      });
    } catch (e) {
      console.error("❌ Git commit failed for data.json");
      process.exit(1);
    }

    console.log(`✔ Article ${id} committed`);
    process.exit(0); // ONE ARTICLE PER RUN
  }
})();
