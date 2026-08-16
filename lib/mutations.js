const { uid } = require("./kv-state");

function findCat(state, catNum) { return state.categories.find(c => c.num === Number(catNum)); }
function findItemAndCat(state, itemId) {
  for (const c of state.categories) {
    const it = c.items.find(i => i.id === itemId);
    if (it) return { cat: c, item: it };
  }
  return null;
}
function fmt(n) { return "R$ " + Math.round(n).toLocaleString("pt-BR"); }

function log(state, who, action) {
  state.log.unshift({ ts: Date.now(), who, action });
  if (state.log.length > 500) state.log.length = 500;
}

const FIELD_LABELS = { deadline: "prazo" };
const RADAR_FIELD_LABELS = { deadline: "prazo" };
const CAT_FIELD_LABELS = { deadline: "prazo" };
const MEETING_FIELD_LABELS = { theme: "tema", when: "data/hora", who: "responsável", link: "link", notes: "observações" };
const FILE_FIELD_LABELS = { title: "título", category: "categoria", link: "link" };
const FORNECEDOR_FIELD_LABELS = { supplier: "fornecedor", contact: "nome do contato", phone: "telefone", proposalLink: "proposta", filesLink: "arquivos do fornecedor", notes: "observações" };
const FORNECEDOR_UPPERCASE_FIELDS = new Set(["supplier", "contact", "phone"]);

function findRadar(item, radarId) { return item.radar.find(r => r.id === radarId); }

const HANDLERS = {
  "toggle-radar"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = found.item.radar.find(r => r.id === p.radarId);
    if (!r) return;
    r.done = !!p.done;
    if (!r.done && found.item.completed) found.item.completed = false;
    log(state, who, `${r.done ? "marcou" : "desmarcou"} "${r.t.slice(0,60)}${r.t.length>60?"…":""}" em ${found.item.code}`);
  },
  "toggle-started"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    found.item.started = !!p.value;
    log(state, who, `marcou "${found.item.code}" como ${found.item.started ? "iniciado" : "não iniciado"}`);
  },
  "toggle-completed"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const value = !!p.value;
    if (value && found.item.radar.length && found.item.radar.some(r => !r.done)) {
      throw new Error("Conclua todos os subitens antes de marcar esta linha como concluída.");
    }
    found.item.completed = value;
    log(state, who, `marcou "${found.item.code}" como ${found.item.completed ? "concluído" : "não concluído"}`);
  },
  "edit-item-name"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const val = String(p.value || "").trim() || found.item.name;
    if (val === found.item.name) return;
    found.item.name = val;
    log(state, who, `renomeou o item ${found.item.code} para "${val}"`);
  },
  "edit-item-val"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    let raw = String(p.value).replace(/[^\d.,-]/g, "");
    if (raw.includes(",")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      const parts = raw.split(".");
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) raw = parts.join("");
    }
    const num = Number(raw) || 0;
    if (num === found.item.val) return;
    found.item.val = num;
    log(state, who, `alterou o valor de ${found.item.code} para ${fmt(num)}`);
  },
  "edit-item-field"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const field = p.field;
    if (!(field in FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (val === (found.item[field] || "")) return;
    found.item[field] = val;
    log(state, who, `editou "${FIELD_LABELS[field]}" do item ${found.item.code}`);
  },
  "add-fornecedor"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = findRadar(found.item, p.radarId);
    if (!r) return;
    if (!Array.isArray(r.fornecedores)) r.fornecedores = [];
    r.fornecedores.push({ id: uid(), supplier: "", contact: "", phone: "", proposalLink: "", filesLink: "", notes: "", accepted: null });
    log(state, who, `adicionou um fornecedor em ${found.item.code} (subitem)`);
  },
  "remove-fornecedor"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = findRadar(found.item, p.radarId);
    if (!r) return;
    const idx = (r.fornecedores || []).findIndex(f => f.id === p.fornecedorId);
    if (idx === -1) return;
    r.fornecedores.splice(idx, 1);
    log(state, who, `removeu um fornecedor de ${found.item.code} (subitem)`);
  },
  "edit-fornecedor-field"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = findRadar(found.item, p.radarId);
    if (!r) return;
    const f = (r.fornecedores || []).find(f => f.id === p.fornecedorId);
    if (!f) return;
    const field = p.field;
    if (!(field in FORNECEDOR_FIELD_LABELS)) return;
    let val = String(p.value || "").trim();
    if (FORNECEDOR_UPPERCASE_FIELDS.has(field)) val = val.toUpperCase();
    if (val === (f[field] || "")) return;
    f[field] = val;
    log(state, who, `editou "${FORNECEDOR_FIELD_LABELS[field]}" de um fornecedor em ${found.item.code} (subitem)`);
  },
  "set-fornecedor-accepted"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = findRadar(found.item, p.radarId);
    if (!r) return;
    const f = (r.fornecedores || []).find(f => f.id === p.fornecedorId);
    if (!f) return;
    const value = p.value === null ? null : !!p.value;
    if (value === f.accepted) return;
    f.accepted = value;
    log(state, who, `marcou fornecedor de ${found.item.code} (subitem) como ${value === null ? "pendente" : (value ? "aceito" : "recusado")}`);
  },
  "edit-radar-field"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = findRadar(found.item, p.radarId);
    if (!r) return;
    const field = p.field;
    if (!(field in RADAR_FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (val === (r[field] || "")) return;
    r[field] = val;
    log(state, who, `editou "${RADAR_FIELD_LABELS[field]}" de um subitem em ${found.item.code}`);
  },
  "edit-cat-field"(state, p, who) {
    const c = findCat(state, p.catNum);
    if (!c) return;
    const field = p.field;
    if (!(field in CAT_FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (val === (c[field] || "")) return;
    c[field] = val;
    log(state, who, `editou "${CAT_FIELD_LABELS[field]}" da frente ${c.num}`);
  },
  "edit-radar-text"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = found.item.radar.find(r => r.id === p.radarId);
    if (!r) return;
    const val = String(p.value || "").trim() || r.t;
    if (val === r.t) return;
    r.t = val;
    log(state, who, `editou um subitem em ${found.item.code}`);
  },
  "add-radar"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    found.item.radar.push({ id: uid(), t: "Novo subitem — clique para editar", done: false, deadline: "", fornecedores: [], comments: [] });
    log(state, who, `adicionou um subitem em "${found.item.code}"`);
  },
  "rm-radar"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    found.item.radar = found.item.radar.filter(r => r.id !== p.radarId);
    log(state, who, `removeu um subitem em "${found.item.code}"`);
  },
  "add-comment"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const text = String(p.text || "").trim();
    if (!text) return;
    let target = found.item;
    let label = found.item.code;
    if (p.radarId) {
      const r = findRadar(found.item, p.radarId);
      if (!r) return;
      if (!Array.isArray(r.comments)) r.comments = [];
      target = r;
      label = `${found.item.code} (subitem)`;
    }
    target.comments.push({ id: uid(), who, ts: Date.now(), text, replies: [] });
    log(state, who, `comentou em "${label}"`);
  },
  "add-reply"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    let target = found.item;
    let label = found.item.code;
    if (p.radarId) {
      const r = findRadar(found.item, p.radarId);
      if (!r) return;
      if (!Array.isArray(r.comments)) r.comments = [];
      target = r;
      label = `${found.item.code} (subitem)`;
    }
    const cm = (target.comments || []).find(c => c.id === p.commentId);
    if (!cm) return;
    const text = String(p.text || "").trim();
    if (!text) return;
    if (!cm.replies) cm.replies = [];
    cm.replies.push({ who, ts: Date.now(), text });
    log(state, who, `respondeu um comentário em "${label}"`);
  },
  "add-item"(state, p, who) {
    const c = findCat(state, p.catNum);
    if (!c) return;
    const maxNum = c.items.reduce((max, i) => {
      const n = Number(String(i.code).split(".")[1]) || 0;
      return n > max ? n : max;
    }, 0);
    const nextNum = maxNum + 1;
    const newItem = { id: uid(), code: `${c.num}.${nextNum}`, name: "Novo item — clique para editar", val: 0, started: false, completed: false, deadline: "", radar: [], comments: [] };
    c.items.push(newItem);
    log(state, who, `adicionou o item "${newItem.code}" em "${c.name}"`);
  },
  "rm-item"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    found.cat.items = found.cat.items.filter(i => i.id !== found.item.id);
    state.categories.forEach(c => c.items.forEach(it => {
      if (Array.isArray(it.blockedBy) && it.blockedBy.includes(found.item.id)) {
        it.blockedBy = it.blockedBy.filter(id => id !== found.item.id);
      }
    }));
    log(state, who, `removeu o item "${found.item.code} — ${found.item.name}"`);
  },
  "add-item-block"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const blocker = findItemAndCat(state, p.blockerId);
    if (!blocker || p.blockerId === p.itemId) return;
    if (!Array.isArray(found.item.blockedBy)) found.item.blockedBy = [];
    if (!found.item.blockedBy.includes(p.blockerId)) {
      found.item.blockedBy.push(p.blockerId);
      log(state, who, `marcou "${found.item.code}" como bloqueado por "${blocker.item.code}"`);
    }
  },
  "remove-item-block"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found || !Array.isArray(found.item.blockedBy)) return;
    found.item.blockedBy = found.item.blockedBy.filter(id => id !== p.blockerId);
    log(state, who, `removeu um bloqueio de "${found.item.code}"`);
  },
  "edit-cat-name"(state, p, who) {
    const c = findCat(state, p.catNum);
    if (!c) return;
    const val = String(p.value || "").trim() || c.name;
    if (val === c.name) return;
    c.name = val;
    log(state, who, `renomeou a frente ${c.num} para "${val}"`);
  },
  "edit-cat-intro"(state, p, who) {
    const c = findCat(state, p.catNum);
    if (!c) return;
    const val = String(p.value || "").trim();
    if (val === c.intro) return;
    c.intro = val;
    log(state, who, `editou a introdução da frente ${c.num}`);
  },
  "add-meeting"(state, p, who) {
    state.meetings.push({ id: uid(), theme: "Nova reunião — clique para editar", when: "", who: "", link: "", notes: "" });
    log(state, who, "adicionou uma nova reunião ao calendário");
  },
  "rm-meeting"(state, p, who) {
    state.meetings = state.meetings.filter(m => m.id !== p.id);
    log(state, who, "removeu uma reunião do calendário");
  },
  "edit-meeting-field"(state, p, who) {
    const m = state.meetings.find(x => x.id === p.id);
    if (!m) return;
    const field = p.field;
    if (!(field in MEETING_FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (val === (m[field] || "")) return;
    m[field] = val;
    log(state, who, `editou "${MEETING_FIELD_LABELS[field]}" de uma reunião`);
  },
  "add-file"(state, p, who) {
    state.files.push({ id: uid(), title: "Novo arquivo — clique para editar", category: "Outro", link: "" });
    log(state, who, "adicionou um arquivo ao projeto");
  },
  "rm-file"(state, p, who) {
    state.files = state.files.filter(f => f.id !== p.id);
    log(state, who, "removeu um arquivo do projeto");
  },
  "edit-file-field"(state, p, who) {
    const f = state.files.find(x => x.id === p.id);
    if (!f) return;
    const field = p.field;
    if (!(field in FILE_FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (val === (f[field] || "")) return;
    f[field] = val;
    log(state, who, `editou "${FILE_FIELD_LABELS[field]}" de um arquivo`);
  }
};

function applyMutation(state, type, payload, who) {
  const handler = HANDLERS[type];
  if (!handler) throw new Error(`tipo de mutação desconhecido: ${type}`);
  handler(state, payload || {}, who);
  return state;
}

module.exports = { applyMutation, findItemAndCat };
