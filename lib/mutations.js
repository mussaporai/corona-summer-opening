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

// catNum é opcional — só as mutações que tocam uma frente do checklist
// passam ele, e é isso que alimenta a bolinha de notificação por frente
// na home (contagem de mudanças desde a última vez que cada pessoa viu).
function log(state, who, action, catNum) {
  const entry = { ts: Date.now(), who, action };
  if (catNum != null) entry.catNum = catNum;
  state.log.unshift(entry);
  if (state.log.length > 500) state.log.length = 500;
}

const FIELD_LABELS = { deadline: "prazo", entrada: "data de entrada" };
const RADAR_FIELD_LABELS = { deadline: "prazo" };
const CAT_FIELD_LABELS = { deadline: "prazo" };
const MEETING_FIELD_LABELS = { theme: "título", when: "data/hora", who: "quem convocou", notes: "o que foi dito" };
const DECISION_FIELD_LABELS = { text: "decisão", date: "data", source: "origem" };
const FILE_FIELD_LABELS = { title: "título", category: "categoria", link: "link", frente: "frente", lastUpdated: "data de atualização" };
const FILE_CATS = ["Desenho técnico", "Pitch do evento", "Contrato", "Planilha", "Outro"];
// Mesmas 7 frentes do checklist/orçamento (state.categories) — "" = Do Projeto (geral, não ligado a uma frente).
const FRENTES = [
  "Acesso ao Local & Conformidade Ambiental",
  "Viagem, Hospedagem & Alimentação da Equipe",
  "Carga & Logística",
  "Palco, Produção & Infraestrutura de Broadcast",
  "Serviços",
  "Dream Team",
  "Back Office & Extras",
];
const FORNECEDOR_FIELD_LABELS = { supplier: "fornecedor", contact: "nome do contato", phone: "telefone", proposalLink: "proposta", filesLink: "arquivos do fornecedor", value: "valor da proposta", notes: "observações" };
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
    log(state, who, `${r.done ? "marcou" : "desmarcou"} "${r.t.slice(0,60)}${r.t.length>60?"…":""}" em ${found.item.code}`, found.cat.num);
  },
  "toggle-started"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    found.item.started = !!p.value;
    log(state, who, `marcou "${found.item.code}" como ${found.item.started ? "iniciado" : "não iniciado"}`, found.cat.num);
  },
  "toggle-completed"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const value = !!p.value;
    if (value && found.item.radar.length && found.item.radar.some(r => !r.done)) {
      throw new Error("Conclua todos os subitens antes de marcar esta linha como concluída.");
    }
    found.item.completed = value;
    log(state, who, `marcou "${found.item.code}" como ${found.item.completed ? "concluído" : "não concluído"}`, found.cat.num);
  },
  "edit-item-name"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const val = String(p.value || "").trim() || found.item.name;
    if (val === found.item.name) return;
    found.item.name = val;
    log(state, who, `renomeou o item ${found.item.code} para "${val}"`, found.cat.num);
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
    log(state, who, `alterou o valor de ${found.item.code} para ${fmt(num)}`, found.cat.num);
  },
  "edit-item-field"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const field = p.field;
    if (!(field in FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (val === (found.item[field] || "")) return;
    found.item[field] = val;
    log(state, who, `editou "${FIELD_LABELS[field]}" do item ${found.item.code}`, found.cat.num);
  },
  "add-fornecedor"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = findRadar(found.item, p.radarId);
    if (!r) return;
    if (!Array.isArray(r.fornecedores)) r.fornecedores = [];
    r.fornecedores.push({ id: uid(), supplier: "", contact: "", phone: "", proposalLink: "", filesLink: "", value: "", notes: "", accepted: null });
    log(state, who, `adicionou um fornecedor em ${found.item.code} (subitem)`, found.cat.num);
  },
  "remove-fornecedor"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = findRadar(found.item, p.radarId);
    if (!r) return;
    const idx = (r.fornecedores || []).findIndex(f => f.id === p.fornecedorId);
    if (idx === -1) return;
    r.fornecedores.splice(idx, 1);
    log(state, who, `removeu um fornecedor de ${found.item.code} (subitem)`, found.cat.num);
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
    log(state, who, `editou "${FORNECEDOR_FIELD_LABELS[field]}" de um fornecedor em ${found.item.code} (subitem)`, found.cat.num);
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
    log(state, who, `marcou fornecedor de ${found.item.code} (subitem) como ${value === null ? "pendente" : (value ? "aceito" : "recusado")}`, found.cat.num);
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
    log(state, who, `editou "${RADAR_FIELD_LABELS[field]}" de um subitem em ${found.item.code}`, found.cat.num);
  },
  "edit-cat-field"(state, p, who) {
    const c = findCat(state, p.catNum);
    if (!c) return;
    const field = p.field;
    if (!(field in CAT_FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (val === (c[field] || "")) return;
    c[field] = val;
    log(state, who, `editou "${CAT_FIELD_LABELS[field]}" da frente ${c.num}`, c.num);
  },
  "edit-radar-text"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const r = found.item.radar.find(r => r.id === p.radarId);
    if (!r) return;
    const val = String(p.value || "").trim() || r.t;
    if (val === r.t) return;
    r.t = val;
    log(state, who, `editou um subitem em ${found.item.code}`, found.cat.num);
  },
  "add-radar"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    found.item.radar.push({ id: uid(), t: "Novo subitem — clique para editar", done: false, deadline: "", fornecedores: [], comments: [] });
    log(state, who, `adicionou um subitem em "${found.item.code}"`, found.cat.num);
  },
  "rm-radar"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    found.item.radar = found.item.radar.filter(r => r.id !== p.radarId);
    log(state, who, `removeu um subitem em "${found.item.code}"`, found.cat.num);
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
    log(state, who, `comentou em "${label}"`, found.cat.num);
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
    log(state, who, `respondeu um comentário em "${label}"`, found.cat.num);
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
    log(state, who, `adicionou o item "${newItem.code}" em "${c.name}"`, c.num);
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
    log(state, who, `removeu o item "${found.item.code} — ${found.item.name}"`, found.cat.num);
  },
  "add-item-block"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found) return;
    const blocker = findItemAndCat(state, p.blockerId);
    if (!blocker || p.blockerId === p.itemId) return;
    if (!Array.isArray(found.item.blockedBy)) found.item.blockedBy = [];
    if (!found.item.blockedBy.includes(p.blockerId)) {
      found.item.blockedBy.push(p.blockerId);
      log(state, who, `marcou "${found.item.code}" como bloqueado por "${blocker.item.code}"`, found.cat.num);
    }
  },
  "remove-item-block"(state, p, who) {
    const found = findItemAndCat(state, p.itemId);
    if (!found || !Array.isArray(found.item.blockedBy)) return;
    found.item.blockedBy = found.item.blockedBy.filter(id => id !== p.blockerId);
    log(state, who, `removeu um bloqueio de "${found.item.code}"`, found.cat.num);
  },
  "edit-cat-name"(state, p, who) {
    const c = findCat(state, p.catNum);
    if (!c) return;
    const val = String(p.value || "").trim() || c.name;
    if (val === c.name) return;
    c.name = val;
    log(state, who, `renomeou a frente ${c.num} para "${val}"`, c.num);
  },
  "edit-cat-intro"(state, p, who) {
    const c = findCat(state, p.catNum);
    if (!c) return;
    const val = String(p.value || "").trim();
    if (val === c.intro) return;
    c.intro = val;
    log(state, who, `editou a introdução da frente ${c.num}`, c.num);
  },
  "add-meeting"(state, p, who) {
    state.meetings.push({ id: uid(), theme: "Título da reunião", when: "", who: "", notes: "", participantes: [] });
    log(state, who, "adicionou uma nova reunião");
  },
  "rm-meeting"(state, p, who) {
    state.meetings = state.meetings.filter(m => m.id !== p.id);
    log(state, who, "removeu uma reunião");
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
  "add-meeting-participant"(state, p, who) {
    const m = state.meetings.find(x => x.id === p.id);
    if (!m || !p.email) return;
    if (!Array.isArray(m.participantes)) m.participantes = [];
    if (!m.participantes.includes(p.email)) m.participantes.push(p.email);
    log(state, who, `adicionou um participante a "${(m.theme||"").slice(0,60)}"`);
  },
  "remove-meeting-participant"(state, p, who) {
    const m = state.meetings.find(x => x.id === p.id);
    if (!m || !Array.isArray(m.participantes)) return;
    m.participantes = m.participantes.filter(e => e !== p.email);
    log(state, who, `removeu um participante de "${(m.theme||"").slice(0,60)}"`);
  },
  "add-file"(state, p, who) {
    const type = p && p.type === "link" ? "link" : "file";
    const title = (p && String(p.title || "").trim().slice(0, 120)) || "Novo arquivo — clique para editar";
    const category = (p && FILE_CATS.includes(p.category)) ? p.category : "Outro";
    const restrictedTo = Array.isArray(p && p.restrictedTo)
      ? [...new Set(p.restrictedTo.map(e => String(e || "").toLowerCase().trim()).filter(Boolean))]
      : [];
    const frente = (p && FRENTES.includes(p.frente)) ? p.frente : "";
    state.files.push({
      id: uid(), title, category, type, frente,
      link: (p && String(p.value || "").trim()) || "",
      addedBy: who || "", createdAt: Date.now(), favorite: false, restrictedTo
    });
    log(state, who, `adicionou ${type === "link" ? "um link" : "um arquivo"} à biblioteca: "${title.slice(0,60)}"${restrictedTo.length ? " (acesso restrito)" : ""}`);
  },
  "rm-file"(state, p, who) {
    state.files = state.files.filter(f => f.id !== p.id);
    log(state, who, "removeu um arquivo do projeto");
  },
  "toggle-file-favorite"(state, p, who) {
    const f = state.files.find(x => x.id === p.id);
    if (!f) return;
    f.favorite = !!p.value;
    log(state, who, `${f.favorite ? "marcou" : "desmarcou"} "${(f.title||"").slice(0,60)}" como favorito`);
  },
  "set-file-restriction"(state, p, who) {
    const f = state.files.find(x => x.id === p.id);
    if (!f) return;
    const emails = Array.isArray(p.emails)
      ? [...new Set(p.emails.map(e => String(e || "").toLowerCase().trim()).filter(Boolean))]
      : [];
    f.restrictedTo = emails;
    log(state, who, emails.length
      ? `restringiu o acesso a "${(f.title||"").slice(0,60)}"`
      : `removeu a restrição de acesso de "${(f.title||"").slice(0,60)}"`);
  },
  "edit-file-field"(state, p, who) {
    const f = state.files.find(x => x.id === p.id);
    if (!f) return;
    const field = p.field;
    if (!(field in FILE_FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (field === "frente" && val && !FRENTES.includes(val)) return;
    if (val === (f[field] || "")) return;
    f[field] = val;
    log(state, who, `editou "${FILE_FIELD_LABELS[field]}" de um arquivo`);
  },
  // Troca só o conteúdo (link ou arquivo no R2) mantendo o mesmo registro —
  // título, categoria, favorito e restrição de acesso continuam os mesmos.
  "replace-file-content"(state, p, who) {
    const f = state.files.find(x => x.id === p.id);
    if (!f) return;
    const val = String(p.value || "").trim();
    if (!val) return;
    f.link = val;
    log(state, who, `substituiu o ${f.type === "link" ? "link" : "arquivo"} de "${(f.title||"").slice(0,60)}"`);
  },
  "add-decision"(state, p, who) {
    state.decisions.push({ id: uid(), text: "", date: "", source: "", createdAt: Date.now(), addedBy: who || "" });
    log(state, who, "registrou uma nova decisão");
  },
  "rm-decision"(state, p, who) {
    state.decisions = state.decisions.filter(d => d.id !== p.id);
    log(state, who, "removeu uma decisão");
  },
  "edit-decision-field"(state, p, who) {
    const d = state.decisions.find(x => x.id === p.id);
    if (!d) return;
    const field = p.field;
    if (!(field in DECISION_FIELD_LABELS)) return;
    const val = String(p.value || "").trim();
    if (val === (d[field] || "")) return;
    d[field] = val;
    log(state, who, `editou "${DECISION_FIELD_LABELS[field]}" de uma decisão`);
  },
  // Não gera entrada de log — é uma ação passiva de "eu vi isso agora",
  // não uma mudança de conteúdo. Zera a bolinha de notificação da frente
  // só pra quem chamou isso, os outros continuam vendo a contagem deles.
  "mark-category-seen"(state, p, who) {
    const catNum = Number(p.catNum);
    if (!catNum || !who) return;
    const email = who.toLowerCase();
    if (!state.seenAt) state.seenAt = {};
    if (!state.seenAt[email]) state.seenAt[email] = {};
    state.seenAt[email][catNum] = Date.now();
  },
  "add-file-note"(state, p, who) {
    const f = state.files.find(x => x.id === p.id);
    if (!f) return;
    const text = String(p.text || "").trim();
    if (!text) return;
    if (!Array.isArray(f.notes)) f.notes = [];
    f.notes.push({ id: uid(), who, ts: Date.now(), text });
    log(state, who, `adicionou uma nota em "${(f.title||"").slice(0,60)}"`);
  }
};

function applyMutation(state, type, payload, who) {
  const handler = HANDLERS[type];
  if (!handler) throw new Error(`tipo de mutação desconhecido: ${type}`);
  handler(state, payload || {}, who);
  return state;
}

module.exports = { applyMutation, findItemAndCat };
