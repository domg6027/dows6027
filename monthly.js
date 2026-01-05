// monthly.js (ESM) — DOWS6027 WARNING SERVICE

import fs from "fs/promises";
import path from "path";

import {
  getDailyData,
  setDailyData,
  checkHardLock,
  saveHardLock,
  readFileText
} from "./helpers/dataManager.js";

import { runMonthlyProcess } from "./monthlyTasks.js";

/* -------------------------------------------------- */
/* Yearly Release Builder                             */
/* -------------------------------------------------- */

async function runYearlyRelease(previousYear) {
  console.log(`📦 Creating yearly release package for ${previousYear}...`);

  const releaseDir = path.join("releases", `yearly-${previousYear}`);
  await fs.mkdir(releaseDir, { recursive: true });

  const filesToCopy = [
    "index2.html",
    "archive.html",
    "data",
    "warning",
    "PDFS"
  ];

  for (const item of filesToCopy) {
    const src = path.resolve(item);
    const dest = path.join(releaseDir, item);

    try {
      await fs.cp(src, dest, { recursive: true });
      console.log(`✔ Copied ${item}`);
    } catch {
      console.warn(`⚠ Skipped ${item} (not found)`);
    }
  }

  const manifest = {
    system: "DOWS6027",
    service: "Warning Service",
    type: "yearly-release",
    year: previousYear,
    generated_at: new Date().toISOString(),
    contents: filesToCopy,
    notes: "Readable yearly snapshot (no compression)"
  };

  await fs.writeFile(
    path.join(releaseDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`📘 Yearly release for ${previousYear} completed.`);
}

/* -------------------------------------------------- */
/* Monthly Runner                                     */
/* -------------------------------------------------- */

export async function runMonthly() {
  console.log("📅 Monthly run started (DOWS6027)...");

  const dailyData = await getDailyData();

  const today = new Date();
  const year = today.getUTCFullYear();
  const monthIndex = today.getUTCMonth(); // 0 = Jan
  const month = String(monthIndex + 1).padStart(2, "0");

  const monthLabel = `${year}-${month}`;

  /* -------------------------------------------------- */
  /* Guard: already ran for this month                  */
  /* -------------------------------------------------- */

  if (dailyData.last_monthly_run === monthLabel) {
    console.log(`⛔ Monthly run already completed for ${monthLabel}.`);
    return;
  }

  /* -------------------------------------------------- */
  /* Monthly tasks                                     */
  /* -------------------------------------------------- */

  try {
    const indexHtml = await readFileText("./public/index2.html");

    if (!indexHtml.includes(`data-month="${monthLabel}"`)) {
      await runMonthlyProcess();
      console.log(`✨ Monthly tasks completed for ${monthLabel}.`);
    } else {
      console.log(`⛔ Monthly content already present for ${monthLabel}.`);
    }
  } catch {
    console.warn("⚠ index2.html unreadable — running monthly tasks anyway.");
    await runMonthlyProcess();
  }

  /* -------------------------------------------------- */
  /* Yearly release — ONLY in January                   */
  /* -------------------------------------------------- */

  if (monthIndex === 0) {
    const previousYear = year - 1;
    const yearlyKey = String(previousYear);

    console.log("🗓 January detected — checking yearly release...");

    if (await checkHardLock("yearly", yearlyKey)) {
      console.log(`⛔ Yearly release already completed for ${previousYear}.`);
    } else {
      try {
        await runYearlyRelease(previousYear);
        await saveHardLock("yearly", yearlyKey);
        console.log(`🔐 Yearly lock saved for ${previousYear}.`);
      } catch (err) {
        console.error("❌ Yearly release failed — lock NOT saved.");
        throw err;
      }
    }
  } else {
    console.log("ℹ️ Not January — yearly release skipped.");
  }

  /* -------------------------------------------------- */
  /* Persist state                                     */
  /* -------------------------------------------------- */

  await setDailyData({
    ...dailyData,
    last_monthly_run: monthLabel
  });

  console.log("🏁 Monthly run completed (DOWS6027).");
}

/* -------------------------------------------------- */
/* CLI entry                                          */
/* -------------------------------------------------- */

if (import.meta.url === `file://${process.argv[1]}`) {
  runMonthly().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
