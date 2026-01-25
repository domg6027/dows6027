/**
 * DOWS6027 – DAILY CONTROLLER
 * Orchestrates PNW PDF generation ONE FILE AT A TIME
 * Node 20 – ES Module – GitHub Actions safe
 */

import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";

/* -------------------- PATHS -------------------- */

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "data.json");

/* -------------------- GUARDS -------------------- */

if (!fs.existsSync(DATA_FILE)) {
  throw new Error("Missing data.json – cannot determine state");
}

/* -------------------- HELPERS -------------------- */

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: { "User-Agent": "Mozilla/5.0" } },
        res => {
          let data = "";
          res.on("data", d => (data += d));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}`));
            } else {
              resolve(data);
            }
          });
        }
      )
      .on("error", reject);
  });
}

/* -------------------- ARCHIVE SCAN -------------------- */

async function getHighestArchiveId() {
  const html = await fetch(
    "https://www.prophecynewswatch.com/archive.cfm"
  );

  const ids = (html.match(/recent_news_id=\d+/g) || [])
    .map(x => Number(x.replace("recent_news_id=", "")));

  if (!ids.length) {
    throw new Error("Could not detect any article IDs in archive");
  }

  return Math.max(...ids);
}

/* -------------------- MAIN -------------------- */

(async () => {
  console.log("▶ DAILY RUN START");

  let state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  console.log("▶ Last processed article:", state.last_article_number);

  let highestArchiveId;
  try {
    highestArchiveId = await getHighestArchiveId();
  } catch (e) {
    console.error("❌ Failed to read PNW archive:", e.message);
    process.exit(1);
  }

  console.log("▶ Highest article at PNW:", highestArchiveId);

  if (state.last_article_number >= highestArchiveId) {
    console.log("✅ Already up to date – nothing to do");
    process.exit(0);
  }

  /* ---- Controlled sequential loop ---- */

  while (true) {
    state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (state.last_article_number >= highestArchiveId) {
      console.log("✅ All available articles processed");
      break;
    }

    console.log(
      `➡ Next article after ${state.last_article_number}`
    );

    try {
      execSync("node onepdf.js", {
        stdio: "inherit"
      });
    } catch (e) {
      console.error(
        "❌ onepdf.js failed – stopping to preserve state"
      );
      process.exit(1);
    }
  }

  console.log("✅ DAILY RUN COMPLETE");
})();
