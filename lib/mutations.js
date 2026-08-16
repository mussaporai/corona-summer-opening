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

const FIELD_LABELS = { supplier: "fornecedor", contact: "contato", phone: "telefone", proposalLink: "proposta", notes: "observações", deadline: "prazo" };

const HANDLERS = {
  "toggle-radar"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = found.item.radar.find(r => r.id === p.radarId);
    if (!r) return;
    r.done = !!p.done;
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
    const num = Number(String(p.value).replace(/[^\d.-]/g, "")) || 0;
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
    found.item.radar.push({ id: uid(), t: "Novo subitem — clique para editar", done: false });
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
    found.item.comments.push({ id: uid(), who, ts: Date.now(), text, replies: [] });
    log(state, who, `comentou em "${found.item.code}"`);
  },
  "add-reply"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const cm = found.item.comments.find(c => c.id === p.commentId);
    if (!cm) return;
    const text = String(p.text || "").trim();
    if (!text) return;
    if (!cm.replies) cm.replies = [];
    cm.replies.push({ who, ts: Date.now(), text });
    log(state, who, `respondeu um comentário em "${found.item.code}"`);
  },
  "add-item"(state, p, who) {
    const c = findCat(state, p.catNum);
    if (!c) return;
    const nextNum = c.items.length + 1;
    const newItem = { id: uid(), code: `${c.num}.${nextNum}`, name: "Novo item — clique para editar", val: 0, started: false, completed: false, deadline: "", supplier: "", contact: "", phone: "", proposalLink: "", notes: "", radar: [], comments: [] };
    c.items.push(newItem);
    log(state, who, `adicionou o item "${newItem.code}" em "${c.name}"`);
  },
  "rm-item"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    found.cat.items = found.cat.items.filter(i => i.id !== found.item.id);
    log(state, who, `removeu o item "${found.item.code} — ${found.item.name}"`);
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
    const val = String(p.value || "").trim();
    if (val === (m[p.field] || "")) return;
    m[p.field] = val;
    log(state, who, `editou "${p.field}" de uma reunião`);
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
    const val = String(p.value || "").trim();
    if (val === (f[p.field] || "")) return;
    f[p.field] = val;
    log(state, who, `editou "${p.field}" de um arquivo`);
  }
};

function applyMutation(state, type, payload, who) {
  const handler = HANDLERS[type];
  if (!handler) throw new Error(`tipo de mutação desconhecido: ${type}`);
  handler(state, payload || {}, who);
  return state;
}

module.exports = { applyMutation };
