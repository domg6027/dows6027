// monthly.js (ESM)

import {
  getDailyData,
  setDailyData,
  checkHardLock,
  saveHardLock,
  readFileText
} from "./helpers/dataManager.js";

import { runYearlyProcess } from "./yearly.js";
import { runMonthlyProcess } from "./monthlyTasks.js";

export async function runMonthly() {
  console.log("📅 Monthly run started...");

  const dailyData = await getDailyData();

  const today = new Date();
  const year = today.getUTCFullYear();
  const month = String(today.getUTCMonth() + 1).padStart(2, "0");

  const yearlyKey = `${year}`;
  const monthLabel = `${year}-${month}`;

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
      console.log(`⛔ Monthly content already present in index2.html for ${monthLabel}.`);
    }
  } catch (err) {
    console.error("❌ Could not read index2.html. Running monthly tasks anyway.");
    await runMonthlyProcess();
  }

  /* -------------------------------------------------- */
  /* Yearly process (hard lock)                         */
  /* -------------------------------------------------- */

  if (await checkHardLock("yearly", yearlyKey)) {
    console.log(`⛔ Yearly run already completed for ${year}.`);
  } else {
    try {
      await runYearlyProcess();
      await saveHardLock("yearly", yearlyKey);
      console.log(`🔐 Yearly lock saved for ${year}.`);
    } catch (err) {
      console.error("❌ Yearly process failed. Year lock not saved.");
      throw err;
    }
  }

  /* -------------------------------------------------- */
  /* Persist state                                      */
  /* -------------------------------------------------- */

  await setDailyData({
    ...dailyData,
    last_monthly_run: monthLabel,
    last_yearly_run: yearlyKey
  });

  console.log("🏁 Monthly run completed.");
}
