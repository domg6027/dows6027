/**
 * onepdf.js
 * Fetch ONE valid PNW article, convert to PDF, commit, then update data.json
 * Node 20 · ES Module · GitHub Actions safe
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import { generate } from "@pdfme/generator";
import pkg from "@pdfme/common";

const { text } = pkg;

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const DATA_FILE = path.join(ROOT, "data.json");
const BASE_PDF = path.join(ROOT, "TEMPLATES", "blank.pdf");

/* -------------------- GUARDS -------------------- */

if (!fs.existsSync(BASE_PDF)) {
  throw new Error("blank.pdf missing in TEMPLATES folder");
}

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR);
}

if (!fs.existsSync(DATA_FILE)) {
  throw new Error("data.json missing in repository root");
}

/* -------------------- GIT IDENTITY (CI SAFE) -------------------- */

try {
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git config user.name "GitHub Actions"`);
} catch {}

/* -------------------- HELPERS -------------------- */

function fetchArticle(id) {
  return new Promise((resolve, reject) => {
    const url = `https://pnw.org.za/?p=${id}`;

    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        if (res.statusCode === 302 || res.statusCode === 404) {
          resolve(null); // trigger LOOP
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = "";
        res.on("data", d => (data += d));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

/* ---- split into 1800–2200 char chunks ---- */

function chunkText(str, min = 1800, max = 2200) {
  const chunks = [];
  let pos = 0;

  while (pos < str.length) {
    let size = Math.min(max, str.length - pos);
    let slice = str.slice(pos, pos + size);

    const lastSpace = slice.lastIndexOf(" ");
    if (slice.length > min && lastSpace > min) {
      slice = slice.slice(0, lastSpace);
      size = slice.length;
    }

    chunks.push(slice.trim());
    pos += size;
  }

  return chunks;
}

/* -------------------- MAIN -------------------- */

(async () => {
  console.log("▶ onepdf.js start");

  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let articleId = state.last_article_number + 1;

  while (true) {
    console.log(`➡ Trying article ${articleId}`);

    const html = await fetchArticle(articleId);

    // ONLY loop condition
    if (!html) {
      articleId++;
      continue;
    }

    // crude but reliable: ads INCLUDED
    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = chunkText(cleanText);

    const pdfPath = path.join(PDF_DIR, `PNW-${articleId}.pdf`);

    const template = {
      basePdf: fs.readFileSync(BASE_PDF),
      schemas: [
        {
          body: {
            type: text,
            position: { x: 40, y: 40 },
            width: 515,
            height: 760,
            fontSize: 11
          }
        }
      ]
    };

    const pdfBuffer = await generate({
      template,
      inputs: chunks.map(c => ({ body: c }))
    });

    fs.writeFileSync(pdfPath, pdfBuffer);

    /* ---- COMMIT PDF FIRST ---- */
    try {
      execSync(`git add "${pdfPath}"`);
      execSync(`git commit -m "Add PNW article ${articleId}"`);
    } catch (e) {
      console.error("❌ Git commit failed for PDF:", articleId);
      process.exit(1);
    }

    /* ---- UPDATE data.json ONLY AFTER PDF COMMIT ---- */

    state.last_article_number = articleId;
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

    execSync(`git add "${DATA_FILE}"`);
    execSync(`git commit -m "Update last_article_number to ${articleId}"`);

    console.log(`✔ Article ${articleId} committed`);
    process.exit(0);
  }
})();
