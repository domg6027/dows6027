/**
 * DOWS6027 – DAILY PNW RUN (SERIAL + COMMIT SAFE)
 * Node 20 | ES Modules | GitHub Actions
 * One article → one PDF → commit → repeat
 */

import fs from "fs";
import path from "path";
import https from "https";
import * as cheerio from "cheerio";
import { generate } from "@pdfme/generator";
import { execSync } from "child_process";

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "TMP");
const DATA_FILE = path.join(ROOT, "data.json");
const FONT_PATH = path.join(ROOT, "fonts", "Swansea-q3pd.ttf");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

/* -------------------- SAFETY CHECKS -------------------- */

if (!fs.existsSync(FONT_PATH)) {
  throw new Error("Missing font: fonts/Swansea-q3pd.ttf");
}

if (!fs.existsSync(BASE_PDF)) {
  throw new Error("Missing base PDF: TEMPLATES/blank.pdf");
}

/* -------------------- STATE (LOCKED BASELINE) -------------------- */

let state = {
  last_date_used: "2025-12-11",
  last_URL_processed:
    "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  current_date: "2025-12-11",
  last_article_number: 9256
};

if (fs.existsSync(DATA_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    console.warn("⚠ data.json corrupted — using hard baseline");
  }
}

/* -------------------- LOG START -------------------- */

console.log("▶ DAILY RUN START");
console.log("▶ Starting from article:", state.last_article_number);

/* -------------------- NETWORK -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(data);
          }
        });
      })
      .on("error", reject);
  });
}

/* -------------------- MAIN LOOP -------------------- */

(async () => {
  let archiveHtml;

  try {
    archiveHtml = await fetch("https://www.prophecynewswatch.com/archive.cfm");
  } catch (e) {
    console.error("❌ Failed to fetch archive:", e.message);
    process.exit(1);
  }

  const articleIds = Array.from(
    new Set(
      (archiveHtml.match(/recent_news_id=\d+/g) || []).map(x =>
        Number(x.replace("recent_news_id=", ""))
      )
    )
  )
    .filter(id => id > state.last_article_number)
    .sort((a, b) => a - b);

  console.log("➡ Found", articleIds.length, "new articles");

  for (const id of articleIds) {
    console.log("➡ Processing article", id);

    let html;
    try {
      html = await fetch(
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`
      );
    } catch {
      console.warn("⚠ Article missing (404):", id);
      continue;
    }

    const $ = cheerio.load(html);

    const container = $("#content")
      .find("div")
      .filter((_, el) => $(el).text().length > 500)
      .first();

    if (!container.length) {
      console.warn("⚠ Skipped (empty):", id);
      continue;
    }

    const text = container.text().replace(/\s+/g, " ").trim();
    if (!text) {
      console.warn("⚠ Skipped (blank):", id);
      continue;
    }

    fs.writeFileSync(path.join(TMP_DIR, `${id}.txt`), text, "utf8");

    try {
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
        inputs: [{ body: text }],
        options: {
          font: {
            Swansea: {
              data: fs.readFileSync(FONT_PATH),
              fallback: true
            }
          }
        }
      });

      const pdfPath = path.join(PDF_DIR, `${id}.pdf`);
      fs.writeFileSync(pdfPath, pdf);

      /* -------------------- UPDATE STATE -------------------- */

      state.last_article_number = id;
      state.last_URL_processed =
        `https://www.prophecynewswatch.com/article.cfm?recent_news_id=${id}`;
      state.current_date = new Date().toISOString().slice(0, 10);

      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

      /* -------------------- COMMIT IMMEDIATELY -------------------- */

      execSync("git add PDFS data.json TMP", { stdio: "ignore" });
      execSync(`git commit -m "PNW article ${id}"`, { stdio: "ignore" });

      console.log("✔ PDF generated + committed:", id);
    } catch (e) {
      console.error("❌ Failed PDF:", id, e.message);
      break; // HARD STOP — preserve recovery point
    }
  }

  console.log("✅ DAILY RUN COMPLETE");
})();
