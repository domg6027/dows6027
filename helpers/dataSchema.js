// helpers/dataSchema.js

module.exports = {
  validate(data) {
    const errors = [];

    if (typeof data.last_date_used !== "string")
      errors.push("last_date_used must be a string (YYYY-MM-DD).");

    if (typeof data.last_URL_processed !== "string")
      errors.push("last_URL_processed must be a string URL.");

    if (typeof data.current_date !== "string")
      errors.push("current_date must be a string (YYYY-MM-DD).");

    if (typeof data.last_article_number !== "number")
      errors.push("last_article_number must be a number.");

    if (errors.length > 0) {
      throw new Error(
        "❌ data.js failed validation:\n" + errors.join("\n")
      );
    }

    return true;
  }
};
