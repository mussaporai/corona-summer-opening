// Corona Summer Opening — estado compartilhado (servidor / Vercel KV) entre todas as páginas
const SHOW_DATE = new Date(2026, 11, 19, 0, 0, 0); // 19 dez 2026
const ADMIN_EMAIL = "marcelo.mussa@hotmail.com";

let state = { categories: [], log: [], meetings: [], files: [] };
let teamData = { members: [], categoryOwners: {}, isAdmin: false };

async function fetchState(){
  const res = await fetch("/api/state");
  if (res.ok) state = await res.json();
  return state;
}

async function fetchTeam(){
  const res = await fetch("/api/team");
  if (res.ok) teamData = await res.json();
  return teamData;
}

async function mutate(type, payload){
  const res = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload })
  });
  if (res.ok) { state = await res.json(); }
  else {
    let msg = "Não consegui salvar — tente de novo.";
    try { const data = await res.json(); if (data && data.error) msg = data.error; } catch(e){}
    toast(msg);
  }
  return state;
}

function nowTs(){ return Date.now(); }

function fmtTs(ts){
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
}

let currentUserEmail = null;
let hasCashflowAccess = false;
function author(){ return currentUserEmail || "Anônimo"; }

function canEditValues(){
  if (!currentUserEmail) return false;
  const email = currentUserEmail.toLowerCase();
  if (email === ADMIN_EMAIL) return true;
  return (teamData.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
}

const PUBLIC_PAGES = ["login.html", "admin.html"];
const PASSWORD_EXEMPT = ["login.html", "admin.html", "change-password.html"];
const ONBOARDING_EXEMPT = ["login.html", "admin.html", "change-password.html", "onboarding.html"];
function currentPage(){ return (location.pathname.split("/").pop() || "index.html"); }

const authReady = (async () => {
  let mustChangePassword = false;
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    currentUserEmail = data.email || null;
    mustChangePassword = !!data.mustChangePassword;
    hasCashflowAccess = !!data.cashflowAccess;
  } catch(e) {
    currentUserEmail = null;
  }
  if (!currentUserEmail && !PUBLIC_PAGES.includes(currentPage())) {
    location.href = "login.html";
    return null;
  }
  if (currentUserEmail && mustChangePassword && !PASSWORD_EXEMPT.includes(currentPage())) {
    location.href = "change-password.html";
    return null;
  }
  if (currentUserEmail && !ONBOARDING_EXEMPT.includes(currentPage())) {
    try {
      await fetchTeam();
      const has = (teamData.members||[]).some(m => (m.email||"").toLowerCase() === currentUserEmail.toLowerCase());
      if (!has) { location.href = "onboarding.html"; return null; }
    } catch(e){}
  }
  renderSessionInfo();
  return currentUserEmail;
})();

function renderSessionInfo(){
  const el = document.getElementById("session-info");
  if (!el) return;
  if (currentUserEmail) {
    el.innerHTML = `Logado como <strong>${escapeHtml(currentUserEmail)}</strong> · <a href="#" id="logout-link">Sair</a>`;
    const link = document.getElementById("logout-link");
    if (link) link.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await fetch("/api/logout", { method: "POST" }); } catch(err){}
      location.href = "login.html";
    });
  } else {
    el.textContent = "";
  }
}

function toast(msg){
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove("show"), 2200);
}

const fmt = n => "R$ " + Math.round(n).toLocaleString("pt-BR");

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function getElVal(el){ return (el.tagName === "INPUT" || el.tagName === "TEXTAREA") ? el.value : el.textContent; }

function findCat(catNum){ return state.categories.find(c => c.num === Number(catNum)); }
function findItemAndCat(itemId){
  for (const c of state.categories) {
    const it = c.items.find(i => i.id === itemId);
    if (it) return { cat: c, item: it };
  }
  return null;
}

function catStats(){
  return state.categories.map(c => {
    let t = 0, d = 0, total = 0;
    c.items.forEach(it => { t += it.radar.length; d += it.radar.filter(r=>r.done).length; total += Number(it.val||0); });
    return { ...c, t, d, total, pct: t ? Math.round(d/t*100) : 0 };
  });
}

function overallPct(){
  const stats = catStats();
  const t = stats.reduce((s,c)=>s+c.t,0);
  const d = stats.reduce((s,c)=>s+c.d,0);
  return t ? Math.round(d/t*100) : 0;
}

function todayStr(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function daysOverdue(item){
  if (!item.deadline || item.completed) return 0;
  const diff = Math.floor((new Date(todayStr()) - new Date(item.deadline)) / 86400000);
  return diff > 0 ? diff : 0;
}

function isOverdue(item){ return daysOverdue(item) > 0; }

function daysUntilDeadline(item){
  if (!item.deadline || item.completed) return null;
  const diff = Math.floor((new Date(item.deadline) - new Date(todayStr())) / 86400000);
  return diff;
}

function nearDeadlineItems(withinDays){
  const limit = withinDays || 7;
  const out = [];
  state.categories.forEach(c => c.items.forEach(it => {
    const days = daysUntilDeadline(it);
    if (days !== null && days >= 0 && days <= limit) out.push({ item: it, cat: c, days });
  }));
  return out.sort((a,b) => a.days - b.days);
}

function overdueItems(){
  const out = [];
  state.categories.forEach(c => c.items.forEach(it => {
    if (isOverdue(it)) out.push({ item: it, cat: c, days: daysOverdue(it) });
  }));
  return out.sort((a,b) => b.days - a.days);
}

function teamMember(email){
  return (teamData.members||[]).find(m => (m.email||"").toLowerCase() === (email||"").toLowerCase());
}

function displayName(email){
  const m = teamMember(email);
  return (m && m.name) || email || "Anônimo";
}

// ---------- Countdown (compartilhado) ----------
function updateCountdown(elId){
  const el = document.getElementById(elId || "cd-nums");
  if (!el) return;
  const diff = SHOW_DATE.getTime() - Date.now();
  if (diff <= 0) {
    el.innerHTML = `<div class="cd-unit"><div class="v">🎉</div><div class="l">é hoje</div></div>`;
    return;
  }
  const d = Math.floor(diff/86400000);
  const h = Math.floor((diff%86400000)/3600000);
  const m = Math.floor((diff%3600000)/60000);
  const s = Math.floor((diff%60000)/1000);
  const unit = elId === "hc-nums" ? "hc-unit" : "cd-unit";
  el.innerHTML = [[d,"dias"],[h,"hrs"],[m,"min"],[s,"seg"]].map(([v,l]) =>
    `<div class="${unit}"><div class="v">${String(v).padStart(2,"0")}</div><div class="l">${l}</div></div>`
  ).join("");
}
function startCountdowns(){
  ["cd-nums","hc-nums"].forEach(id => { if (document.getElementById(id)) updateCountdown(id); });
  setInterval(() => ["cd-nums","hc-nums"].forEach(id => { if (document.getElementById(id)) updateCountdown(id); }), 1000);
}

// ---------- Edição em andamento (evita que o polling atropele o que a pessoa está digitando) ----------
let editingCount = 0;
document.addEventListener("focusin", e => {
  if (e.target.matches("input, textarea, [contenteditable='true']")) editingCount++;
});
document.addEventListener("focusout", e => {
  if (e.target.matches("input, textarea, [contenteditable='true']")) editingCount = Math.max(0, editingCount - 1);
});
function isEditing(){ return editingCount > 0 || document.querySelector(".bell-panel.open"); }

// ---------- Sincronização periódica ----------
function startPolling(onUpdate){
  setInterval(async () => {
    if (isEditing()) return;
    try {
      await fetchState();
      if (typeof onUpdate === "function") onUpdate();
    } catch(e){}
  }, 20000);
}

// ---------- Sino de notificações ----------
function renderBell(){
  const dot = document.getElementById("bell-dot");
  const list = document.getElementById("bell-panel-list");
  if (!dot) return;
  const lastSeenTs = Number(localStorage.getItem("corona_bell_seen") || 0);
  const unseen = state.log.filter(l => l.ts > lastSeenTs).length;
  dot.classList.toggle("show", unseen > 0);
  if (list) {
    if (!state.log.length) {
      list.innerHTML = `<div class="bell-panel-empty">Nenhuma notificação ainda.</div>`;
    } else {
      list.innerHTML = state.log.slice(0,8).map(l => `
        <div class="bell-panel-row"><span class="who">${escapeHtml(displayName(l.who))}</span> ${escapeHtml(l.action)}<div class="ts">${fmtTs(l.ts)}</div></div>
      `).join("");
    }
  }
}
function initBell(){
  const btn = document.getElementById("bell-btn");
  const panel = document.getElementById("bell-panel");
  if (!btn || !panel) return;
  renderBell();
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      localStorage.setItem("corona_bell_seen", String(nowTs()));
      renderBell();
    }
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove("open");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initBell();
  const btnExport = document.getElementById("btn-export");
  if (btnExport) btnExport.addEventListener("click", exportState);
  const btnImport = document.getElementById("btn-import");
  const fileImport = document.getElementById("file-import");
  if (btnImport && fileImport) {
    btnImport.addEventListener("click", () => fileImport.click());
    fileImport.addEventListener("change", importState);
  }
});

async function exportState(){
  const data = JSON.stringify(state, null, 2);
  const filename = `corona-summer-checklist-${new Date().toISOString().slice(0,10)}.json`;
  const blob = new Blob([data], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Estado exportado ✓");
}

function importState(e){
  const file = e.target.files[0];
  if (!file) return;
  if (currentUserEmail !== ADMIN_EMAIL) {
    alert("Só o administrador master pode restaurar um backup — isso substitui o estado compartilhado de todo mundo.");
    e.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !parsed.categories) throw new Error("formato inválido");
      if (!confirm("Isso substitui o estado compartilhado de TODOS os usuários pelo conteúdo desse arquivo. Continuar?")) return;
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bulk-replace", payload: { state: parsed } })
      });
      if (!res.ok) throw new Error("falha ao restaurar");
      state = await res.json();
      if (typeof render === "function") render();
      toast("Estado importado ✓");
    } catch(err) {
      alert("Não consegui restaurar esse backup: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}
