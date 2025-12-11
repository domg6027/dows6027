// helpers/dataManager.js
const fs = require("fs");
const path = require("path");
const dataSchema = require("./dataSchema");

const DATA_PATH = path.join(__dirname, "..", "data.js");

function loadRaw() {
  const file = fs.readFileSync(DATA_PATH, "utf-8");
  const json = JSON.parse(file);
  dataSchema.validate(json); // Ensure valid before using
  return json;
}

function saveRaw(update) {
  const jsonString = JSON.stringify(update, null, 2);
  fs.writeFileSync(DATA_PATH, jsonString, "utf-8");
}

/* DAILY SERVICE ACCESS */
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

/* WEEKLY SERVICE ACCESS */
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

/* MONTHLY CAN USE THE FULL OBJECT (needs all fields) */
function getAllData() {
  return loadRaw();
}

function setAllData(updatedData) {
  saveRaw({ ...updatedData });
}

module.exports = {
  getDailyData,
  setDailyData,
  getWeeklyData,
  setWeeklyData,
  getAllData,
  setAllData
};
