const { kvGet, kvSet } = require("./db");
const SEED = require("../data/seed.json");

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
        fornecedores: [],
        radar: it.radar.map(t => ({ id: uid(), t, done: false })),
        comments: []
      }))
    })),
    log: [],
    meetings: [],
    files: []
  };
}

// Migra itens do formato antigo (um fornecedor fixo por item) para o novo
// formato de múltiplos fornecedores por item — não descarta dados existentes.
function migrateItem(it) {
  if (!Array.isArray(it.fornecedores)) {
    const hadData = it.supplier || it.contact || it.phone || it.proposalLink || it.notes;
    it.fornecedores = hadData ? [{
      id: uid(),
      supplier: it.supplier || "", contact: it.contact || "", phone: it.phone || "",
      proposalLink: it.proposalLink || "", filesLink: "", notes: it.notes || "", accepted: null
    }] : [];
    delete it.supplier; delete it.contact; delete it.phone; delete it.proposalLink; delete it.notes;
  }
  return it;
}

function migrateState(state) {
  let changed = false;
  state.categories.forEach(c => c.items.forEach(it => {
    if (!Array.isArray(it.fornecedores)) { migrateItem(it); changed = true; }
  }));
  return changed;
}

async function getState() {
  let state = await kvGet(STATE_KEY);
  if (!state || !state.categories) {
    state = seedState();
    await kvSet(STATE_KEY, state);
    return state;
  }
  if (migrateState(state)) await kvSet(STATE_KEY, state);
  return state;
}

async function saveState(state) {
  await kvSet(STATE_KEY, state);
}

module.exports = { getState, saveState, uid };
