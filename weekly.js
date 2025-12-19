import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const WEEKLY_FILE = path.join(DATA_DIR, "weekly.json");

const DEFAULT_DATA = {
  current_date: "0000-00-00",
  last_article_number: 0
};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadWeeklyData() {
  try {
    if (!fs.existsSync(WEEKLY_FILE)) {
      fs.writeFileSync(WEEKLY_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
      return structuredClone(DEFAULT_DATA);
    }
    const raw = fs.readFileSync(WEEKLY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DATA, ...parsed };
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

function saveWeeklyData(data) {
  fs.writeFileSync(WEEKLY_FILE, JSON.stringify(data, null, 2));
}

function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

const today = getTodayUTC();
const weeklyData = loadWeeklyData();

if (weeklyData.current_date === today) {
  process.exit(0);
}

weeklyData.current_date = today;
saveWeeklyData(weeklyData);
