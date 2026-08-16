const { kvGet, kvSet } = require("./db");
const TEAM_KEY = "corona:team";

async function getTeam() {
  let data = await kvGet(TEAM_KEY);
  if (!data || !data.members) {
    data = { members: [], categoryOwners: {}, masterAssistants: [] };
    await kvSet(TEAM_KEY, data);
  }
  if (!data.categoryOwners) data.categoryOwners = {};
  if (!data.masterAssistants) data.masterAssistants = [];
  return data;
}

async function saveTeam(data) {
  await kvSet(TEAM_KEY, data);
}

module.exports = { getTeam, saveTeam };
