const { kvGet, kvSet, kvGetWithVersion, kvSetIfUnchanged } = require("./db");
const SEED = require("../data/seed.json");

const VENUES = ["lencois", "noronha"];
function stateKey(venue) {
  if (!VENUES.includes(venue)) throw new Error(`local inválido: ${venue}`);
  return `corona:state:${venue}`;
}

let uidCounter = 1;
function uid() { return "s" + (uidCounter++) + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Esqueleto genérico (sem prazo, sem valor) — só usado se um local for
// aberto sem nunca ter sido semeado com dado real. Lençóis e Noronha, na
// prática, já chegam com conteúdo real (ver script de migração/seed) antes
// de qualquer pessoa acessar — isso aqui é a rede de segurança, não o
// caminho normal.
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
    decisions: [],
    seenAt: {}
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

// V3: reunião simplificada ao mínimo — título, data/hora, quem convocou,
// participantes e um campo único de anotações ("o que foi dito").
function migrateMeetingsV3(state) {
  let changed = false;
  if (!Array.isArray(state.meetings)) { state.meetings = []; changed = true; }
  state.meetings.forEach(m => {
    if (!Array.isArray(m.participantes)) { m.participantes = []; changed = true; }
    ["done", "pauta", "actions", "link"].forEach(field => {
      if (field in m) { delete m[field]; changed = true; }
    });
  });
  return changed;
}

// V7: registro de decisões — o que foi decidido, de onde veio (reunião,
// call, mensagem) e quem registrou. Existe pra ser preenchido manualmente
// hoje e, mais tarde, alimentado por um robô de transcrição de calls.
function migrateDecisionsV7(state) {
  let changed = false;
  if (!Array.isArray(state.decisions)) { state.decisions = []; changed = true; }
  return changed;
}

// V8: rastreamento por pessoa de quando cada uma viu cada frente pela
// última vez — alimenta a bolinha de notificação (contagem de mudanças
// desde então) na home. Um por e-mail, não global. Vive dentro do estado de
// cada local — a mesma pessoa tem um "visto por último" por local.
function migrateSeenAtV8(state) {
  let changed = false;
  if (!state.seenAt || typeof state.seenAt !== "object") { state.seenAt = {}; changed = true; }
  return changed;
}

// V9: files saiu daqui e virou corona:files (compartilhado entre os locais,
// não faz mais parte do estado por local) — remove o campo se sobrar de
// dado migrado de antes da separação.
function migrateFilesOutV9(state) {
  if ("files" in state) { delete state.files; return true; }
  return false;
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
  if (migrateMeetingsV3(state)) changed = true;
  if (migrateDecisionsV7(state)) changed = true;
  if (migrateSeenAtV8(state)) changed = true;
  if (migrateFilesOutV9(state)) changed = true;
  return changed;
}

async function getState(venue) {
  const key = stateKey(venue);
  let state = await kvGet(key);
  if (!state || !state.categories) {
    state = seedState();
    await kvSet(key, state);
    return state;
  }
  if (migrateState(state)) await kvSet(key, state);
  return state;
}

async function saveState(venue, state) {
  await kvSet(stateKey(venue), state);
}

async function getStateWithVersion(venue) {
  const key = stateKey(venue);
  let entry = await kvGetWithVersion(key);
  if (!entry || !entry.value || !entry.value.categories) {
    const state = seedState();
    await kvSet(key, state);
    entry = await kvGetWithVersion(key);
  }
  if (migrateState(entry.value)) {
    await kvSet(key, entry.value);
    entry = await kvGetWithVersion(key);
  }
  return entry;
}

async function saveStateIfUnchanged(venue, state, version) {
  return kvSetIfUnchanged(stateKey(venue), state, version);
}

module.exports = { getState, saveState, getStateWithVersion, saveStateIfUnchanged, uid, VENUES };
