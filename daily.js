/**
 * DOWS6027 – DAILY RUN (GREGORIAN)
 * DIAGNOSTIC VERSION – DO NOT TRIM LOGS
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
/* 📅 GREGORIAN DATE (UTC-SAFE) */
/* ─────────────────────────────────────── */

const now = new Date();
const yyyy = now.getUTCFullYear();
const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
const dd = String(now.getUTCDate()).padStart(2, "0");

const today = `${yyyy}${mm}${dd}`;
console.log("📅 GREGORIAN DATE (YYYYMMDD):", today);

/* ─────────────────────────────────────── */
/* 📂 PATHS */
/* ─────────────────────────────────────── */

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");
const JSON_PATH = path.join(ROOT, "state", "lastRun.json");

console.log("📁 PDF DIR:", PDF_DIR);
console.log("🗂 JSON PATH:", JSON_PATH);

/* Ensure directories exist */
fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });

/* ─────────────────────────────────────── */
/* 📄 PDF GENERATION (TEST ARTIFACT) */
/* ─────────────────────────────────────── */

const pdfName = `DOWS6027-DAILY-${today}.pdf`;
const pdfPath = path.join(PDF_DIR, pdfName);

console.log("🧪 Attempting PDF write:", pdfPath);

try {
  fs.writeFileSync(
    pdfPath,
    `DOWS6027 DAILY PDF\nDate: ${today}\nGenerated: ${new Date().toISOString()}\n`,
    "utf8"
  );
  console.log("✅ PDF CREATED");
} catch (err) {
  console.error("❌ PDF WRITE FAILED", err);
}

/* Verify PDF exists */
const pdfExists = fs.existsSync(pdfPath);
console.log("📄 PDF EXISTS AFTER WRITE:", pdfExists);

/* ─────────────────────────────────────── */
/* 📝 JSON STATE UPDATE */
/* ─────────────────────────────────────── */

console.log("🧪 Attempting JSON update");

const jsonPayload = {
  lastDailyRun: today,
  timestamp: new Date().toISOString(),
  pdf: pdfName
};

try {
  fs.writeFileSync(JSON_PATH, JSON.stringify(jsonPayload, null, 2), "utf8");
  console.log("✅ JSON UPDATED");
} catch (err) {
  console.error("❌ JSON WRITE FAILED", err);
}

/* Verify JSON exists */
console.log("🗂 JSON EXISTS:", fs.existsSync(JSON_PATH));

/* ─────────────────────────────────────── */
/* 🧾 GIT STATUS DIAGNOSTIC */
/* ─────────────────────────────────────── */

try {
  const status = execSync("git status --porcelain", { encoding: "utf8" });
  console.log("📦 GIT STATUS:");
  console.log(status || "✔️ CLEAN");
} catch (err) {
  console.error("❌ GIT STATUS FAILED", err);
}

/* ─────────────────────────────────────── */
/* ✅ END */
/* ─────────────────────────────────────── */

console.log("🏁 DAILY.JS COMPLETED");
