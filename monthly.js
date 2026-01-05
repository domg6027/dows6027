// monthly.js (ESM) — DOWS6027 WARNING SERVICE

import {
  getDailyData,
  setDailyData,
  checkHardLock,
  saveHardLock,
  readFileText,
  writeJsonFile
} from "./helpers/dataManager.js";

import { runMonthlyProcess } from "./monthlyTasks.js";

export async function runMonthly() {
  console.log("📅 Monthly run started (DOWS6027)...");

  const dailyData = await getDailyData();

  const today = new Date();
  const year = today.getUTCFullYear();
  const monthIndex = today.getUTCMonth(); // 0 = Jan
  const month = String(monthIndex + 1).padStart(2, "0");

  const monthLabel = `${year}-${month}`;
  const yearlyKey = `${year}`;

  /* -------------------------------------------------- */
  /* Guard: already ran for this month                  */
  /* -------------------------------------------------- */

  if (dailyData.last_monthly_run === monthLabel) {
    console.log(`⛔ Monthly run already completed for ${monthLabel}. Exiting.`);
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
  } catch (err) {
    console.warn("⚠️ index2.html not readable — running monthly tasks anyway.");
    await runMonthlyProcess();
  }

  /* -------------------------------------------------- */
  /* Yearly process — ONLY in JANUARY                   */
  /* -------------------------------------------------- */

  if (monthIndex === 0) {
    console.log("🗓 January detected — checking yearly run...");

    if (await checkHardLock("yearly", yearlyKey)) {
      console.log(`⛔ Yearly run already completed for ${year}.`);
    } else {
      try {
        console.log(`📦 Building yearly release package for ${year}...`);

        const yearlyPackage = {
          year,
          generated_at: new Date().toISOString(),
          source: "DOWS6027",
          service: "Warning Service",
          type: "yearly-release",
          months_covered: [],
          notes: "Auto-generated during January monthly run"
        };

        // Optional: populate months from data store if you wish later
        // yearlyPackage.months_covered = [...]

        await writeJsonFile(
          `./releases/yearly-${year}.json`,
          yearlyPackage
        );

        await saveHardLock("yearly", yearlyKey);
        console.log(`🔐 Yearly lock saved for ${year}.`);

      } catch (err) {
        console.error("❌ Yearly process failed — lock NOT saved.");
        throw err;
      }
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
