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

/* ================================================== */
/* MAIN MONTHLY ENTRY                                 */
/* ================================================== */

export async function runMonthly() {
  console.log("📅 Monthly run started (DOWS6027)...");

  const dailyData = await getDailyData();

  const today = new Date();
  const year = today.getUTCFullYear();
  const monthIndex = today.getUTCMonth(); // 0 = January
  const month = String(monthIndex + 1).padStart(2, "0");

  const monthLabel = `${year}-${month}`;
  const yearlyKey = String(year);

  /* -------------------------------------------------- */
  /* Guard: already ran for this month                  */
  /* -------------------------------------------------- */

  if (dailyData.last_monthly_run === monthLabel) {
    console.log(`⛔ Monthly already completed for ${monthLabel}.`);
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
      console.log(`ℹ️ Monthly content already present for ${monthLabel}.`);
    }
  } catch (err) {
    console.warn("⚠️ index2.html unreadable — running monthly tasks anyway.");
    await runMonthlyProcess();
  }

  /* -------------------------------------------------- */
  /* Yearly process — ONLY in JANUARY                   */
  /* -------------------------------------------------- */

  if (monthIndex === 0) {
    const previousYear = year - 1;

    console.log(`🗓 January detected — checking yearly archive for ${previousYear}...`);

    if (await checkHardLock("yearly", String(previousYear))) {
      console.log(`⛔ Yearly archive already created for ${previousYear}.`);
    } else {
      const indexHtml = await readFileText("./public/index2.html");

      /* Check if previous year actually has data */
      const hasData =
        indexHtml.includes(`${previousYear}-`) ||
        indexHtml.includes(`data-year="${previousYear}"`);

      if (!hasData) {
        console.log(`ℹ️ No data found for ${previousYear}. Yearly archive skipped.`);
      } else {
        try {
          await runYearlyRelease(previousYear);
          await injectArchiveLink(previousYear);
          await saveHardLock("yearly", String(previousYear));
          console.log(`🔐 Yearly lock saved for ${previousYear}.`);
        } catch (err) {
          console.error("❌ Yearly process failed — lock NOT saved.");
          throw err;
        }
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
    last_monthly_run: monthLabel
  });

  console.log("🏁 Monthly run completed (DOWS6027).");
}

/* ================================================== */
/* YEARLY RELEASE (DIRECTORY COPY)                    */
/* ================================================== */

async function runYearlyRelease(previousYear) {
  console.log(`📦 Creating yearly release for ${previousYear}...`);

  const releaseDir = path.join("releases", `yearly-${previousYear}`);
  await fs.mkdir(releaseDir, { recursive: true });

  const itemsToCopy = [
    "index2.html",
    "archive.html",
    "data",
    "warning",
    "PDFS"
  ];

  for (const item of itemsToCopy) {
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
    contents: itemsToCopy
  };

  await fs.writeFile(
    path.join(releaseDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`📘 Yearly release for ${previousYear} completed.`);
}

/* ================================================== */
/* ARCHIVE.HTML LINK INJECTION                        */
/* ================================================== */

async function injectArchiveLink(previousYear) {
  const archivePath = "./public/archive.html";
  let html = await readFileText(archivePath);

  if (html.includes(`yearly-${previousYear}`)) {
    console.log(`ℹ️ Archive link for ${previousYear} already exists.`);
    return;
  }

  const marker = "<!-- YEARLY ARCHIVES -->";

  if (!html.includes(marker)) {
    console.warn("⚠ YEARLY ARCHIVES marker not found. Link not injected.");
    return;
  }

  const linkBlock = `
<h3>${previousYear} – Yearly Archive</h3>
<ul>
  <li>
    <a href="releases/yearly-${previousYear}/index2.html">
      ${previousYear} Warning Service Archive
    </a>
  </li>
</ul>
`;

  html = html.replace(marker, `${marker}\n${linkBlock}`);

  await fs.writeFile(archivePath, html);
  console.log(`🔗 Archive link injected for ${previousYear}.`);
}
