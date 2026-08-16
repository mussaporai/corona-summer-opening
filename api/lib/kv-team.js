const { kv } = require("@vercel/kv");
const TEAM_KEY = "corona:team";

async function getTeam() {
  let data = await kv.get(TEAM_KEY);
  if (!data || !data.members) {
    data = { members: [], categoryOwners: {} };
    await kv.set(TEAM_KEY, data);
  }
  if (!data.categoryOwners) data.categoryOwners = {};
  return data;
}

async function saveTeam(data) {
  await kv.set(TEAM_KEY, data);
}

module.exports = { getTeam, saveTeam };
