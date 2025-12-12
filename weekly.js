import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* Resolve current directory */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------------------------- */
/*               PATHS + DEFAULT VALUES               */
/* -------------------------------------------------- */

const DATA_DIR = path.join(__dirname, "..", "data");
const WEEKLY_FILE = path.join(DATA_DIR, "weekly.json");

const DEFAULT_DATA = {
  current_date: "0000-00-00",
  last_article_number: 0
};

/* -------------------------------------------------- */
/*              Ensure data folder exists             */
/* -------------------------------------------------- */
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* -------------------------------------------------- */
/*               Internal: safe JSON read             */
/* -------------------------------------------------- */
function loadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
      return structuredClone(fallback);
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);

    return { ...fallback, ...parsed };
  } catch (e) {
    console.error("JSON read error:", e);
    return structuredClone(fallback);
  }
}

/* -------------------------------------------------- */
/*            Internal: safe JSON write               */
/* -------------------------------------------------- */
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("JSON write error:", e);
  }
}

/* -------------------------------------------------- */
/*                  Exported methods                  */
/* -------------------------------------------------- */

export function getWeeklyData() {
  return loadJSON(WEEKLY_FILE, DEFAULT_DATA);
}

export function setWeeklyData(data) {
  const finalData = { ...DEFAULT_DATA, ...data };
  saveJSON(WEEKLY_FILE, finalData);
}
