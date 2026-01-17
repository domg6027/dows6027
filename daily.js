/**
 * DAILY PDF GENERATOR
 * One article per PDF
 * Node-only, PDFME-only
 */

import fs from "fs";
import path from "path";
import process from "process";

import { generate } from "@pdfme/generator";
import commonPkg from "@pdfme/common";
const { text } = commonPkg;

const __dirname = new URL(".", import.meta.url).pathname;

// ================= CONFIG =================

const ARCHIVE_URL = "https://www.prophecynewswatch.com/article";
const STATE_FILE = path.join(__dirname, "state.json");
const OUTPUT_DIR = path.join(__dirname, "PDFS");
const TMP_DIR = path.join(__dirname, "TMP");

const MIN_TEXT_LENGTH = 50;

// ==========================================

function log(...args) {
  console.log(...args);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { lastProcessed: 0 };
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------- FETCH ----------

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ---------- HTML PARSING ----------

function stripHTML(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractArticle(html) {
  // FORMAT A (older)
  let match =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<div class="article-content">([\s\S]*?)<\/div>/i);

  if (!match) return "";

  return stripHTML(match[1]);
}

function extractTitle(html) {
  const m =
    html.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
    html.match(/<title>(.*?)<\/title>/i);

  if (!m) return "Untitled Article";

  return stripHTML(m[1]).split("|")[0].trim();
}

// ---------- PDF TEMPLATE ----------

function buildTemplate(title, body) {
  return {
    schemas: [
      {
        title: {
          type: "text",
          position: { x: 20, y: 20 },
          width: 170,
          height: 20,
          fontSize: 18,
          fontWeight: "bold",
        },
        body: {
          type: "text",
          position: { x: 20, y: 45 },
          width: 170,
          height: 240,
          fontSize: 11,
          lineHeight: 1.4,
        },
      },
    ],
    basePdf: null,
  };
}

// ---------- MAIN ----------

async function main() {
  log("▶ DAILY RUN START");
  log("⏱ UTC:", new Date().toISOString());

  ensureDir(OUTPUT_DIR);
  ensureDir(TMP_DIR);

  const state = loadState();
  let lastProcessed = state.lastProcessed || 0;
  let pdfCount = 0;

  // Determine latest article ID
  const MAX_ID = 9408;

  const ids = [];
  for (let i = lastProcessed + 1; i <= MAX_ID; i++) {
    ids.push(i);
  }

  log("📰 New articles found:", ids.length);

  for (const id of ids) {
    log("➡ Processing", id);

    let html;
    try {
      html = await fetchText(`${ARCHIVE_URL}/${id}`);
    } catch {
      log("⚠ Fetch failed:", id);
      lastProcessed = id;
      continue;
    }

    const title = extractTitle(html);
    const body = extractArticle(html);

    if (body.length < MIN_TEXT_LENGTH) {
      fs.writeFileSync(
        path.join(TMP_DIR, `EMPTY-${id}.txt`),
        body
      );
      log("⚠ Skipped (empty content):", id);
      lastProcessed = id;
      continue;
    }

    try {
      const template = buildTemplate(title, body);

      const pdf = await generate({
        template,
        inputs: [{ title, body }],
      });

      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `${date}-${id}.pdf`;

      fs.writeFileSync(
        path.join(OUTPUT_DIR, filename),
        Buffer.from(pdf)
      );

      log("✅ PDF created:", filename);
      pdfCount++;
    } catch (err) {
      log("❌ PDF error:", id, err.message);
    }

    lastProcessed = id;
  }

  saveState({ lastProcessed });

  if (pdfCount === 0) {
    log("⚠ No PDFs generated (non-fatal)");
  } else {
    log(`✔ DAILY RUN COMPLETE — PDFs: ${pdfCount}`);
  }
}

// ---------- RUN ----------

main().catch((err) => {
  console.error("💥 FATAL ERROR:", err);
  process.exit(1);
});
