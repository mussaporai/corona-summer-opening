const { kvGet, kvSet, kvGetWithVersion, kvSetIfUnchanged } = require("./db");
const SEED = require("../data/seed.json");

const STATE_KEY = "corona:state";

let uidCounter = 1;
function uid() { return "s" + (uidCounter++) + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function seedState() {
  return {
    categories: SEED.map(c => ({
      num: c.num, key: c.key, name: c.name, intro: c.intro, deadline: "",
      items: c.items.map(it => ({
        id: uid(), code: it.code, name: it.name, val: it.val,
        started: false, completed: false, deadline: "", blockedBy: [],
        radar: it.radar.map(t => ({ id: uid(), t, done: false, deadline: "", fornecedores: [], comments: [] })),
        comments: []
      }))
    })),
    log: [],
    meetings: [],
    files: []
  };
}

// V1: migra itens do formato antigo (um fornecedor fixo por item) para
// múltiplos fornecedores por item — mantido por segurança em dados muito antigos.
function migrateItemV1(it) {
  if (!Array.isArray(it.fornecedores)) {
    const hadData = it.supplier || it.contact || it.phone || it.proposalLink || it.notes;
    it.fornecedores = hadData ? [{
      id: uid(),
      supplier: it.supplier || "", contact: it.contact || "", phone: it.phone || "",
      proposalLink: it.proposalLink || "", filesLink: "", notes: it.notes || "", accepted: null
    }] : [];
    delete it.supplier; delete it.contact; delete it.phone; delete it.proposalLink; delete it.notes;
  }
}

// V2: fornecedores saem do nível de item e vão para o nível de subitem;
// item, subitem e categoria ganham campo de prazo próprio.
function migrateStateV2(state) {
  let changed = false;
  state.categories.forEach(c => {
    if (typeof c.deadline !== "string") { c.deadline = ""; changed = true; }
    c.items.forEach(it => {
      if (Array.isArray(it.fornecedores)) { delete it.fornecedores; changed = true; }
      if (!Array.isArray(it.blockedBy)) { it.blockedBy = []; changed = true; }
      it.radar.forEach(r => {
        if (!Array.isArray(r.fornecedores)) { r.fornecedores = []; changed = true; }
        if (typeof r.deadline !== "string") { r.deadline = ""; changed = true; }
        if (!Array.isArray(r.comments)) { r.comments = []; changed = true; }
      });
    });
  });
  return changed;
}

function migrateState(state) {
  let changed = false;
  state.categories.forEach(c => c.items.forEach(it => {
    if (!Array.isArray(it.fornecedores) && typeof it.supplier === "string") {
      migrateItemV1(it);
      changed = true;
    }
  }));
  if (migrateStateV2(state)) changed = true;
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

async function getStateWithVersion() {
  let entry = await kvGetWithVersion(STATE_KEY);
  if (!entry || !entry.value || !entry.value.categories) {
    const state = seedState();
    await kvSet(STATE_KEY, state);
    entry = await kvGetWithVersion(STATE_KEY);
  }
  if (migrateState(entry.value)) {
    await kvSet(STATE_KEY, entry.value);
    entry = await kvGetWithVersion(STATE_KEY);
  }
  return entry;
}

async function saveStateIfUnchanged(state, version) {
  return kvSetIfUnchanged(STATE_KEY, state, version);
}

module.exports = { getState, saveState, getStateWithVersion, saveStateIfUnchanged, uid };
