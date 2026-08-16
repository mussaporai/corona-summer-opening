const { kv } = require("@vercel/kv");
const SEED = require("../../data/seed.json");

const STATE_KEY = "corona:state";

let uidCounter = 1;
function uid() { return "s" + (uidCounter++) + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function seedState() {
  return {
    categories: SEED.map(c => ({
      num: c.num, key: c.key, name: c.name, intro: c.intro,
      items: c.items.map(it => ({
        id: uid(), code: it.code, name: it.name, val: it.val,
        started: false, completed: false, deadline: "",
        supplier: "", contact: "", phone: "", proposalLink: "", notes: "",
        radar: it.radar.map(t => ({ id: uid(), t, done: false })),
        comments: []
      }))
    })),
    log: [],
    meetings: [],
    files: []
  };
}

async function getState() {
  let state = await kv.get(STATE_KEY);
  if (!state || !state.categories) {
    state = seedState();
    await kv.set(STATE_KEY, state);
  }
  return state;
}

async function saveState(state) {
  await kv.set(STATE_KEY, state);
}

module.exports = { getState, saveState, uid };
