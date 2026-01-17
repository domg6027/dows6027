/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * ULTRA-SAFE VERSION (NO TEMPLATE LITERALS)
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execFileSync } from "child_process";

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
  return new Promise(function (resolve, reject) {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/html",
          "Accept-Language": "en-US,en;q=0.9"
        }
      },
      function (res) {
        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      }
    );

    req.setTimeout(20000, function () {
      req.destroy();
      reject(new Error("timeout"));
    });

    req.on("error", reject);
  });
}

(async function main() {
  let archive = "";
  try {
    archive = await fetchPage("https://www.prophecynewswatch.com/archive.cfm");
  } catch (e) {
    console.error("Archive fetch failed");
    return;
  }

  const matches = archive.match(/recent_news_id=\d+/g) || [];
  const ids = matches
    .map(x => Number(x.replace("recent_news_id=", "")))
    .filter(id => id > lastProcessed)
    .sort((a, b) => a - b);

  console.log("📰 New articles found:", ids.length);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    console.log("➡ Processing", id);

    let html = "";
    try {
      html = await fetchPage(
        "https://www.prophecynewswatch.com/article.cfm?recent_news_id=" + id
      );
    } catch {
      lastProcessed = id;
      continue;
    }

    let body = null;
    const m1 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const m2 = html.match(/class="article-content"[\s\S]*?>([\s\S]*?)<\/div>/i);

    if (m1) body = m1[1];
    if (!body && m2) body = m2[1];

    if (!body) {
      fs.writeFileSync(path.join(TMP_DIR, "FAIL-" + id + ".html"), html);
      lastProcessed = id;
      continue;
    }

    const dateMatch = html.match(/(\w+ \d{1,2}, \d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date();

    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0");

    const htmlPath = path.join(TMP_DIR, id + ".html");
    const pdfPath = path.join(PDF_DIR, ymd + "-" + id + ".pdf");

    fs.writeFileSync(
      htmlPath,
      "<html><head><meta charset='utf-8'></head><body>" +
        body +
        "</body></html>"
    );

    try {
      execFileSync(
        "wkhtmltopdf",
        ["--enable-local-file-access", htmlPath, pdfPath],
        { stdio: "inherit", timeout: 60000 }
      );
    } catch {}

    lastProcessed = id;
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        last_article_number: lastProcessed,
        updated_utc: new Date().toISOString()
      },
      null,
      2
    )
  );

  console.log("✔ DAILY RUN COMPLETE");
})();
