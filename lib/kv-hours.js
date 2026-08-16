const { kvGet, kvSet } = require("./db");
const HOURS_KEY = "corona:hours";

async function getHours() {
  const data = await kvGet(HOURS_KEY);
  if (!data || !data.users) return { users: {} };
  return data;
}

async function saveHours(data) {
  await kvSet(HOURS_KEY, data);
}

module.exports = { getHours, saveHours };
