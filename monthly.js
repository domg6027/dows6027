// monthly.js (ESM) — DOWS6027 WARNING SERVICE (with failsafe)

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

/* ================================================== */
/* MAIN MONTHLY RUNNER                                */
/* ================================================== */

export async function runMonthly() {
  console.log("📅 Monthly run started (DOWS6027)...");

  const dailyData = await getDailyData();

  const today = new Date();
  const year = today.getUTCFullYear();
  const monthIndex = today.getUTCMonth(); // 0 = January
  const month = String(monthIndex + 1).padStart(2, "0");

  const monthLabel = `${year}-${month}`;
  const yearlyKey = String(year - 1); // 🔑 PREVIOUS YEAR

  /* -------------------------------------------------- */
  /* Guard: already ran for this month                  */
  /* -------------------------------------------------- */

  if (dailyData.last_monthly_run === monthLabel) {
    console.log(`⛔ Monthly run already completed for ${monthLabel}.`);
    return;
  }

  /* -------------------------------------------------- */
  /* Monthly process                                   */
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
    console.warn("⚠️ index2.html unreadable — running monthly tasks anyway.");
    await runMonthlyProcess();
  }

  /* -------------------------------------------------- */
  /* Yearly process — ONLY IN JANUARY                   */
  /* -------------------------------------------------- */

  if (monthIndex === 0) {
    console.log("🗓 January detected — checking yearly release...");

    if (await checkHardLock("yearly", yearlyKey)) {
      console.log(`⛔ Yearly release already completed for ${yearlyKey}.`);
    } else {
      await runYearlyRelease(yearlyKey);
      await saveHardLock("yearly", yearlyKey);
      console.log(`🔐 Yearly lock saved for ${yearlyKey}.`);
    }
  } else {
    console.log("ℹ️ Not January — yearly process skipped.");
  }

  /* -------------------------------------------------- */
  /* Persist state                                      */
  /* -------------------------------------------------- */

  await setDailyData({
    ...dailyData,
    last_monthly_run: monthLabel,
    last_yearly_run: monthIndex === 0 ? yearlyKey : dailyData.last_yearly_run
  });

  console.log("🏁 Monthly run completed (DOWS6027).");
}

/* ================================================== */
/* YEARLY RELEASE BUILDER (PREVIOUS YEAR)             */
/* ================================================== */

async function runYearlyRelease(previousYear) {
  console.log(`📦 Creating yearly release package for ${previousYear}...`);

  const releaseDir = path.join("releases", `yearly-${previousYear}`);
  await fs.mkdir(releaseDir, { recursive: true });

  const itemsToArchive = [
    "public/index2.html",
    "archive.html",
    "data",
    "warning",
    "PDFS"
  ];

  for (const item of itemsToArchive) {
    const src = path.resolve(item);
    const dest = path.join(releaseDir, item.replace(/^public\//, ""));

    try {
      await fs.cp(src, dest, { recursive: true });
      console.log(`✔ Archived ${item}`);
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
    contents: itemsToArchive
  };

  await fs.writeFile(
    path.join(releaseDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`📘 Yearly release for ${previousYear} completed.`);
}

/* ================================================== */
/* ENTRY POINT                                        */
/* ================================================== */

if (import.meta.url === `file://${process.argv[1]}`) {
  runMonthly().catch(err => {
    console.error("❌ Monthly runner failed:", err);
    process.exit(1);
  });
}
