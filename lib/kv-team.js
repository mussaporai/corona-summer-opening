const { kvGet, kvSet } = require("./db");
const CASHFLOW_SEED = require("../data/cashflow-access.json");
const TEAM_KEY = "corona:team";

async function getTeam() {
  let data = await kvGet(TEAM_KEY);
  if (!data || !data.members) {
    data = { members: [], categoryOwners: {}, masterAssistants: [], cashflowAccess: CASHFLOW_SEED.slice() };
    await kvSet(TEAM_KEY, data);
  }
  if (!data.categoryOwners) data.categoryOwners = {};
  if (!data.masterAssistants) data.masterAssistants = [];
  if (!data.cashflowAccess) data.cashflowAccess = CASHFLOW_SEED.slice();
  return data;
}

async function saveTeam(data) {
  await kvSet(TEAM_KEY, data);
}

module.exports = { getTeam, saveTeam };
