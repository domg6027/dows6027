// helpers/dataManager.js
import fs from "fs";
import path from "path";
import dataSchema from "./dataSchema.js";
import { fileURLToPath } from "url";

/* Normalize __dirname for ESM */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* Path to data.js */
const DATA_PATH = path.join(__dirname, "..", "data.js");

/* Load JSON safely */
function loadRaw() {
  const file = fs.readFileSync(DATA_PATH, "utf-8");
  const json = JSON.parse(file);
  dataSchema.validate(json);     // Validate the data
  return json;
}

/* Save JSON safely */
function saveRaw(update) {
  const jsonString = JSON.stringify(update, null, 2);
  fs.writeFileSync(DATA_PATH, jsonString, "utf-8");
}

/* === DAILY SERVICE === */
function getDailyData() {
  const d = loadRaw();
  return {
    last_date_used: d.last_date_used,
    last_URL_processed: d.last_URL_processed
  };
}

function setDailyData(newData) {
  const d = loadRaw();
  const updated = {
    ...d,
    last_date_used: newData.last_date_used,
    last_URL_processed: newData.last_URL_processed
  };
  saveRaw(updated);
}

/* === WEEKLY SERVICE === */
function getWeeklyData() {
  const d = loadRaw();
  return {
    current_date: d.current_date,
    last_article_number: d.last_article_number
  };
}

function setWeeklyData(newData) {
  const d = loadRaw();
  const updated = {
    ...d,
    current_date: newData.current_date,
    last_article_number: newData.last_article_number
  };
  saveRaw(updated);
}

/* === MONTHLY SERVICE === */
function getAllData() {
  return loadRaw();
}

function setAllData(updatedData) {
  saveRaw({ ...updatedData });
}

/* === EXPORTS (ESM) === */
export {
  getDailyData,
  setDailyData,
  getWeeklyData,
  setWeeklyData,
  getAllData,
  setAllData
};
