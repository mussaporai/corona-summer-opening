const { verify, parseCookies } = require("../lib/session");
const { getTeam } = require("../lib/kv-team");
const { getState } = require("../lib/kv-state");
const CONTENT = require("../data/cashflow-content.json");

// Fonte única de verdade pro cronograma do financeiro: o mesmo checklist que
// alimenta o Calendário de Produção e a home. Nenhuma data fica hardcoded
// aqui — cada fase referencia o código de item real, e a gente recalcula
// start/end toda vez que a página carrega. Muda o prazo no checklist, o
// financeiro já reflete sozinho, sem precisar editar esse arquivo de novo.
const PROJECT_START = "2026-09-01"; // início real do projeto — ajustar só aqui
const SHOW_DATE = "2026-12-22"; // mesmo valor de assets/app.js e cliente.html

function findItem(state, code) {
  for (const c of state.categories) {
    const it = c.items.find(i => i.code === code);
    if (it) return it;
  }
  return null;
}

function itemDeadlines(item) {
  const dates = [];
  if (item.deadline) dates.push(item.deadline);
  (item.radar || []).forEach(r => { if (r.deadline) dates.push(r.deadline); });
  return dates;
}

// Datas de subitem que vencem DEPOIS do prazo do próprio item representam um
// marco de continuação (ex: "aprovação final", adicionada depois do "envio
// do protocolo") — é isso que captura o fim real de uma fase de dois estágios
// sem precisar caçar texto por substring.
function extensionDeadline(item) {
  if (!item.deadline) return null;
  const later = (item.radar || [])
    .map(r => r.deadline)
    .filter(dl => dl && dl > item.deadline)
    .sort();
  return later.length ? later[later.length - 1] : null;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOffset(dateStr, anchorStr) {
  const d = new Date(dateStr + "T00:00:00");
  const a = new Date(anchorStr + "T00:00:00");
  return Math.round((d - a) / 86400000);
}

function fmtLabel(startStr, endStr, lang) {
  const months = lang === "en"
    ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    : ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  function one(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return lang === "en" ? `${months[d.getMonth()]} ${d.getDate()}` : `${String(d.getDate()).padStart(2,"0")}/${months[d.getMonth()]}`;
  }
  if (startStr === endStr) return one(startStr);
  const sameMonth = startStr.slice(0,7) === endStr.slice(0,7);
  if (sameMonth && lang !== "en") {
    const d1 = new Date(startStr + "T00:00:00"), d2 = new Date(endStr + "T00:00:00");
    return `${String(d1.getDate()).padStart(2,"0")} – ${String(d2.getDate()).padStart(2,"0")}/${months[d1.getMonth()]}`;
  }
  return `${one(startStr)} – ${one(endStr)}`;
}

// Cada fase referencia item(ns) reais do checklist. "items": pega o
// min/max de deadline entre os itens listados. "single": start = deadlines
// do próprio item (o mais cedo), end = deadline do item (ou a extensão,
// se houver uma data de subitem posterior ao prazo do item).
const PHASE_SOURCES = {
  drawing:      { mode: "point-anchored", codes: ["4.2"] },
  icmbio:       { mode: "single-with-extension", codes: ["1.1"] },
  procure:      { mode: "items-span", codes: ["4.7","4.8","4.9","4.10","4.11"] },
  cargoStaging: { mode: "single", codes: ["3.1"] },
  barge:        { mode: "single", codes: ["3.2"] },
  crewMobilize: { mode: "show-relative", beforeDays: 21, spanDays: 9 },
  sitePrep:     { mode: "single", codes: ["4.4"] },
  stageBuild:   { mode: "show-relative", beforeDays: 14, spanDays: 6 },
  techIntegrate:{ mode: "single", codes: ["4.16"] },
  rehearsal:    { mode: "show-relative", beforeDays: 4, spanDays: 1 },
  show:         { mode: "show-fixed", spanDays: 3 },
  strike:       { mode: "strike-relative", codes: ["3.7"] },
};

function computePhaseDates(key, state) {
  const src = PHASE_SOURCES[key];
  if (!src) return null;

  if (src.mode === "point-anchored") {
    const item = findItem(state, src.codes[0]);
    if (!item || !item.deadline) return null;
    const start = PROJECT_START < item.deadline ? PROJECT_START : item.deadline;
    return { start, end: item.deadline };
  }

  if (src.mode === "single") {
    const item = findItem(state, src.codes[0]);
    if (!item) return null;
    const dates = itemDeadlines(item).filter(dl => !item.deadline || dl <= item.deadline);
    if (!dates.length) return null;
    dates.sort();
    return { start: dates[0], end: item.deadline || dates[dates.length - 1] };
  }

  if (src.mode === "single-with-extension") {
    const item = findItem(state, src.codes[0]);
    if (!item || !item.deadline) return null;
    const ext = extensionDeadline(item);
    return { start: item.deadline, end: ext || item.deadline };
  }

  if (src.mode === "items-span") {
    const items = src.codes.map(c => findItem(state, c)).filter(Boolean);
    const dates = items.flatMap(itemDeadlines);
    if (!dates.length) return null;
    dates.sort();
    return { start: dates[0], end: dates[dates.length - 1] };
  }

  if (src.mode === "show-relative") {
    const start = addDays(SHOW_DATE, -src.beforeDays);
    const end = addDays(start, src.spanDays);
    return { start, end };
  }

  if (src.mode === "show-fixed") {
    const start = addDays(SHOW_DATE, -1);
    const end = addDays(SHOW_DATE, src.spanDays - 2);
    return { start, end };
  }

  // Desmontagem começa fisicamente só depois do show fechar — nunca antes,
  // mesmo que o item tenha subitem de negociação de contrato datado antes
  // disso. O fim usa o prazo real do item (frete de retorno), se for
  // depois do início; senão cai num fallback de uma semana.
  if (src.mode === "strike-relative") {
    const start = addDays(SHOW_DATE, 2);
    const item = findItem(state, src.codes[0]);
    const itemEnd = item && item.deadline && item.deadline > start ? item.deadline : null;
    const end = itemEnd || addDays(start, 6);
    return { start, end };
  }

  return null;
}

function buildLiveGantt(state) {
  const phases = CONTENT.PHASES.map((p, i) => {
    const key = Object.keys(PHASE_SOURCES)[i];
    const computed = key ? computePhaseDates(key, state) : null;
    if (!computed) return p; // sem dado suficiente no checklist — mantém o que já está no JSON como fallback
    const startOff = Math.max(0, dayOffset(computed.start, PROJECT_START));
    const endOff = Math.max(startOff, dayOffset(computed.end, PROJECT_START));
    const ptLabel = fmtLabel(computed.start, computed.end, "pt");
    const enLabel = fmtLabel(computed.start, computed.end, "en");
    return {
      ...p,
      start: startOff,
      end: endOff,
      pt: [p.pt[0], p.pt[1], p.pt[2], ptLabel],
      en: [p.en[0], p.en[1], p.en[2], enLabel],
    };
  });
  const maxEnd = Math.max(1, ...phases.map(p => p.end));
  const totalDays = Math.ceil(maxEnd / 7) * 7;
  return { phases, totalDays, projectStart: PROJECT_START };
}

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = verify(cookies.corona_session);
  if (!payload || !payload.email) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  const team = await getTeam();
  const allowed = (team.cashflowAccess || []).map(e => e.toLowerCase()).includes(payload.email.toLowerCase());
  if (!allowed) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const state = await getState();
  const gantt = buildLiveGantt(state);
  res.status(200).json({ ...CONTENT, PHASES: gantt.phases, GANTT_META: { totalDays: gantt.totalDays, projectStart: gantt.projectStart } });
};
