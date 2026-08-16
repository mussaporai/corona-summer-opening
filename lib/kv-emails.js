const { kvGet, kvSet } = require("./db");
const SEED = require("../data/approved-emails.json");
const KEY = "corona:approved-emails";

async function getApprovedEmails() {
  let list = await kvGet(KEY);
  if (!list || !Array.isArray(list)) {
    list = SEED.slice();
    await kvSet(KEY, list);
  }
  return list;
}

async function saveApprovedEmails(list) {
  await kvSet(KEY, list);
}

module.exports = { getApprovedEmails, saveApprovedEmails };
