/**
 * DOWS6027 – DAILY RUN (NODE-ONLY, PDFME)
 * HARDENED / FAIL-SAFE / STATE-AWARE
 */

import fs from "fs";
import path from "path";
import https from "https";
import { generate } from "@pdfme/generator";

console.log("▶ DAILY RUN START");
console.log("⏱ UTC:", new Date().toISOString());

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const TMP_DIR = path.join(ROOT, "tmp");
const STATE_FILE = path.join(ROOT, "data.json");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

let lastProcessed = 9256;
if (fs.existsSync(STATE_FILE)) {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (typeof s.last_article_number === "number") {
      lastProcessed = s.last_article_number;
    }
  } catch {}
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/html",
        },
      },
      res => {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      }
    );
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

(async function main() {
  let archiveHtml;
  try {
    archiveHtml = await fetchPage("https://www.prophecynewswatch.com/archive.cfm");
  } catch {
    throw new Error("❌ Archive fetch failed — aborting");
  }

  const ids = (archiveHtml.match(/recent_news_id=\d+/g) || [])
    .map(x => Number(x.replace("recent_news_id=", "")))
    .filter(id => id > lastProcessed)
    .sort((a, b) => a - b);

  console.log("📰 Articles to process:", ids.length);

  let pdfCount = 0;

  for (const id of ids) {
    console.log("➡ Processing", id);
    let html;
    try {
      html = await fetchPage(
        "https://www.prophecynewswatch.com/article.cfm?recent_news_id=" + id
      );
    } catch {
      lastProcessed = id;
      continue;
    }

    let bodyHtml = null;

    const a1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const a2 = html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);

    if (a1) bodyHtml = a1[1];
    else if (a2) bodyHtml = a2[1];

    if (!bodyHtml) {
      fs.writeFileSync(path.join(TMP_DIR, `FAIL-${id}.html`), html);
      lastProcessed = id;
      continue;
    }

    const text = stripHtml(bodyHtml);
    if (text.length < 200) {
      lastProcessed = id;
      continue;
    }

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();

    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const pdfPath = path.join(PDF_DIR, `${ymd}-${id}.pdf`);

    try {
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
                fontSize: 11,
                lineHeight: 1.4,
              },
            },
          ],
        },
        inputs: [{ content: text }],
      });

      fs.writeFileSync(pdfPath, pdf);
      pdfCount++;
    } catch (e) {
      fs.writeFileSync(
        path.join(TMP_DIR, `PDFFAIL-${id}.txt`),
        text.slice(0, 5000)
      );
    }

    lastProcessed = id;
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        last_article_number: lastProcessed,
        updated_utc: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log("📄 PDFs generated:", pdfCount);
  console.log("✔ DAILY RUN COMPLETE");
})();
