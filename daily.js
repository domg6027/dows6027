/**
 * DOWS6027 – DAILY RUN (GREGORIAN / UTC)
 * HARDENED + DIAGNOSTIC
 * SOURCE OF TRUTH = JSON STATE ONLY
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/* ─────────────────────────────────────── */
/* 🔥 START */
/* ─────────────────────────────────────── */

console.log("══════════════════════════════════════");
console.log("🔥 DAILY.JS STARTED");
console.log("🕒 ISO TIME:", new Date().toISOString());
console.log("📂 CWD:", process.cwd());
console.log("══════════════════════════════════════");

/* ─────────────────────────────────────── */
/* 📅 GREGORIAN DATE (UTC ONLY) */
/* ─────────────────────────────────────── */

const now = new Date();
const YYYY = now.getUTCFullYear();
const MM = String(now.getUTCMonth() + 1).padStart(2, "0");
const DD = String(now.getUTCDate()).padStart(2, "0");

const TODAY = `${YYYY}${MM}${DD}`;

console.log("📅 UTC DATE (YYYYMMDD):", TODAY);

/* ─────────────────────────────────────── */
/* 📂 PATHS */
/* ─────────────────────────────────────── */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const STATE_DIR = path.join(ROOT, "state");
const STATE_FILE = path.join(STATE_DIR, "lastRun.json");

console.log("📁 PDF DIR:", PDF_DIR);
console.log("🗂 STATE FILE:", STATE_FILE);

/* Ensure dirs */
fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

/* ─────────────────────────────────────── */
/* 📖 LOAD STATE (SOURCE OF TRUTH) */
/* ─────────────────────────────────────── */

let state = {
  lastDailyRun: null,
  timestamp: null,
  pdf: null
};

if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    console.log("📖 STATE LOADED:", state);
  } catch (err) {
    console.error("❌ STATE READ FAILED – RESETTING", err);
  }
} else {
  console.log("📖 NO STATE FILE FOUND – INITIAL RUN");
}

/* ─────────────────────────────────────── */
/* ⚠️ DATE DECISION */
/* ─────────────────────────────────────── */

if (state.lastDailyRun === TODAY) {
  console.log("⛔ DAILY ALREADY RAN FOR TODAY – CONTINUING ANYWAY (FORCE MODE)");
} else {
  console.log("➡️ NEW DAILY RUN REQUIRED");
}

/* ─────────────────────────────────────── */
/* 📄 PDF GENERATION */
/* ─────────────────────────────────────── */

const pdfName = `DOWS6027-DAILY-${TODAY}.pdf`;
const pdfPath = path.join(PDF_DIR, pdfName);

console.log("🧪 TARGET PDF:", pdfPath);

try {
  fs.writeFileSync(
    pdfPath,
    [
      "DOWS6027 DAILY REPORT",
      `DATE (UTC): ${TODAY}`,
      `GENERATED: ${new Date().toISOString()}`,
      ""
    ].join("\n"),
    "utf8"
  );
  console.log("✅ PDF WRITE SUCCESS");
} catch (err) {
  console.error("❌ PDF WRITE FAILED", err);
  process.exit(1);
}

console.log("📄 PDF EXISTS:", fs.existsSync(pdfPath));

/* ─────────────────────────────────────── */
/* 📝 UPDATE STATE (AUTHORITATIVE) */
/* ─────────────────────────────────────── */

const newState = {
  lastDailyRun: TODAY,
  timestamp: new Date().toISOString(),
  pdf: pdfName
};

try {
  fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), "utf8");
  console.log("✅ STATE UPDATED:", newState);
} catch (err) {
  console.error("❌ STATE WRITE FAILED", err);
  process.exit(1);
}

/* ─────────────────────────────────────── */
/* 🧾 GIT DIAGNOSTICS */
/* ─────────────────────────────────────── */

try {
  const status = execSync("git status --porcelain", { encoding: "utf8" });
  console.log("📦 GIT STATUS:");
  console.log(status || "✔️ CLEAN");
} catch (err) {
  console.error("❌ GIT STATUS FAILED", err);
}

/* ─────────────────────────────────────── */
/* 🏁 END */
/* ─────────────────────────────────────── */

console.log("══════════════════════════════════════");
console.log("🏁 DAILY.JS COMPLETED");
console.log("══════════════════════════════════════");
