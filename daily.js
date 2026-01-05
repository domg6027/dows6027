/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * FULL DIAGNOSTIC + FULL PATH VERSION
 * ROOT-BASED STATE + MULTI-FILE SAFE
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/* ─────────────────────────────────────── */
/* 🔥 HARD START LOGS */
/* ─────────────────────────────────────── */

console.log("🔥 DAILY.JS STARTED");
console.log("🕒 ISO TIME:", new Date().toISOString());
console.log("🕒 LOCAL TIME:", new Date().toString());
console.log("📂 CWD:", process.cwd());

/* ─────────────────────────────────────── */
/* 📅 GREGORIAN DATE (UTC) */
/* ─────────────────────────────────────── */

const now = new Date();
const YYYY = now.getUTCFullYear();
const MM = String(now.getUTCMonth() + 1).padStart(2, "0");
const DD = String(now.getUTCDate()).padStart(2, "0");

const TODAY_YYYYMMDD = `${YYYY}${MM}${DD}`;
const TODAY_ISO = `${YYYY}-${MM}-${DD}`;

console.log("📅 TODAY UTC (YYYYMMDD):", TODAY_YYYYMMDD);
console.log("📅 TODAY UTC (ISO):", TODAY_ISO);

/* ─────────────────────────────────────── */
/* 📂 ABSOLUTE ROOT PATHS */
/* ─────────────────────────────────────── */

const ROOT = process.cwd();

const PDF_DIR = path.join(ROOT, "PDFS");
const STATE_DIR = path.join(ROOT, "state");
const JSON_PATH = path.join(ROOT, "state", "lastRun.json");

console.log("📁 PDF DIR:", PDF_DIR);
console.log("🗂 STATE DIR:", STATE_DIR);
console.log("🗂 JSON PATH:", JSON_PATH);

/* ─────────────────────────────────────── */
/* 📁 ENSURE DIRECTORIES EXIST */
/* ─────────────────────────────────────── */

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

/* ─────────────────────────────────────── */
/* 🧩 FALLBACK JSON */
/* ─────────────────────────────────────── */

const FALLBACK_STATE = {
  last_date_used: "2025-12-11",
  last_URL_processed: "https://www.prophecynewswatch.com/article.cfm?recent_news_id=9256",
  current_date: "2025-12-11",
  last_article_number: 9256
};

/* ─────────────────────────────────────── */
/* 📖 LOAD STATE */
/* ─────────────────────────────────────── */

let state;

try {
  if (!fs.existsSync(JSON_PATH)) {
    console.log("⚠️ STATE FILE MISSING – CREATING FALLBACK");
    fs.writeFileSync(JSON_PATH, JSON.stringify(FALLBACK_STATE, null, 2), "utf8");
    state = structuredClone(FALLBACK_STATE);
  } else {
    const raw = fs.readFileSync(JSON_PATH, "utf8");
    state = { ...FALLBACK_STATE, ...JSON.parse(raw) };
  }
} catch (err) {
  console.error("❌ STATE LOAD FAILED – USING FALLBACK", err);
  state = structuredClone(FALLBACK_STATE);
}

console.log("📦 LOADED STATE:", state);

/* ─────────────────────────────────────── */
/* 🧠 DETERMINE START DATE */
/* ─────────────────────────────────────── */

let startDate = state.last_date_used;

console.log("➡️ START DATE FROM STATE:", startDate);
console.log("➡️ TARGET DATE:", TODAY_ISO);

/* ─────────────────────────────────────── */
/* 🔁 DATE ITERATOR (YYYY-MM-DD) */
/* ─────────────────────────────────────── */

function nextDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────────────────── */
/* 📄 PROCESS DAILY FILES */
/* ─────────────────────────────────────── */

let processedCount = 0;
let currentDate = startDate;

while (currentDate <= TODAY_ISO) {
  console.log("🔄 PROCESSING DATE:", currentDate);

  const pdfName = `DOWS6027-DAILY-${currentDate.replaceAll("-", "")}.pdf`;
  const pdfPath = path.join(PDF_DIR, pdfName);

  if (fs.existsSync(pdfPath)) {
    console.log("⏭ PDF ALREADY EXISTS – SKIPPING:", pdfName);
  } else {
    try {
      fs.writeFileSync(
        pdfPath,
        `DOWS6027 DAILY REPORT\nDate: ${currentDate}\nGenerated: ${new Date().toISOString()}\n`,
        "utf8"
      );
      console.log("✅ PDF CREATED:", pdfName);
      processedCount++;
    } catch (err) {
      console.error("❌ PDF WRITE FAILED:", pdfName, err);
      break;
    }
  }

  state.last_date_used = currentDate;
  state.current_date = currentDate;

  currentDate = nextDate(currentDate);
}

/* ─────────────────────────────────────── */
/* 📝 SAVE UPDATED STATE */
/* ─────────────────────────────────────── */

try {
  fs.writeFileSync(JSON_PATH, JSON.stringify(state, null, 2), "utf8");
  console.log("✅ STATE JSON UPDATED");
} catch (err) {
  console.error("❌ STATE SAVE FAILED", err);
}

/* ─────────────────────────────────────── */
/* 📦 GIT DIAGNOSTICS */
/* ─────────────────────────────────────── */

try {
  const status = execSync("git status --porcelain", { encoding: "utf8" });
  console.log("📦 GIT STATUS:");
  console.log(status || "✔️ CLEAN");
} catch (err) {
  console.error("❌ GIT STATUS FAILED", err);
}

/* ─────────────────────────────────────── */
/* 🏁 FINAL LOGS */
/* ─────────────────────────────────────── */

console.log("📊 FILES PROCESSED:", processedCount);
console.log("🏁 DAILY.JS COMPLETED");
