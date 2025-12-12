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

  // -------------------------------------------------------------
  // 1️⃣ SOFT CHECK using index2.html (monthly)
  // -------------------------------------------------------------
  try {
    const indexHtml = await readFileText("./public/index2.html");

    if (indexHtml.includes(`data-month="${monthLabel}"`)) {
      console.log(`⛔ Monthly content for ${monthLabel} already present. Skipping monthly tasks.`);
    } else {
      console.log("📘 Running monthly tasks...");

      await runMonthlyProcess();

      console.log(`✨ Monthly tasks completed and index2.html updated for ${monthLabel}.`);
    }
  } catch (err) {
    console.error("❌ Could not read index2.html:", err);
    console.error("❗ Monthly tasks will still attempt to run.");
    await runMonthlyProcess();
  }

  // -------------------------------------------------------------
  // 2️⃣ YEARLY PROCESS (real hard lock)
  // -------------------------------------------------------------
  if (await checkHardLock("yearly", yearlyKey)) {
    console.log(`⛔ Yearly run already completed for ${year}. Skipping yearly tasks.`);
  } else {
    console.log("📗 Running yearly tasks...");
    try {
      await runYearlyProcess();
      await saveHardLock("yearly", yearlyKey);
      console.log(`🔐 YEAR-LOCK set for ${year}`);
    } catch (err) {
      console.error("❌ Yearly process failed:", err);
      console.error("⚠️ No year lock saved.");
      throw err;
    }
  }

  // -------------------------------------------------------------
  // 3️⃣ Update daily data (optional)
  // -------------------------------------------------------------
  await setDailyData({
    ...dailyData,
    last_monthly_run: monthLabel,
    last_yearly_run: yearlyKey
  });

  console.log("🏁 Monthly run completed.");
}
