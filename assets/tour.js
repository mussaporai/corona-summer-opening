// Corona Summer Opening — tour guiado de primeiro acesso (home)
const TOUR_STEPS = [
  { selector: ".hero-countdown", title: "Contagem regressiva", text: "Quanto falta para o Corona Summer Opening, dia 19 de dezembro de 2026, em Lençóis Maranhenses." },
  { selector: "#bell-btn", title: "Notificações", text: "O sino avisa quando algo muda no projeto. Clique nele a qualquer momento para ver as últimas atualizações." },
  { selector: ".progress-hero", title: "Progresso geral", text: "Quantas tarefas do checklist já foram concluídas, atualizado em tempo real conforme o time trabalha." },
  { selector: "#urgent-zone", title: "Prazos", text: "Itens atrasados (vermelho) ou perto do prazo (âmbar) aparecem aqui automaticamente — sem precisar procurar." },
  { selector: "#home-quicklinks", title: "Calendário, Arquivos e Equipe", text: "Acesso rápido às reuniões marcadas, aos documentos do projeto e a quem é quem na equipe Dream." },
  { selector: "#cat-grid", title: "Checklist do Projeto", text: "As 7 frentes do evento. Clique em qualquer uma para ver linhas, subitens, prazos e fornecedores de cada uma." },
  { selector: "#home-more", title: "E mais...", text: "Histórico completo de atividade do projeto e o diretório de todos os fornecedores cadastrados, em ordem alfabética." }
];

let tourStep = 0;
let tourOverlayEl = null;
let tourTooltipEl = null;
let tourHighlightEl = null;
let tourResizeHandler = null;

function tourShouldRun(){
  if (!currentUserEmail) return false;
  const member = teamMember(currentUserEmail);
  return !!member && !member.tourSeen;
}

function startTour(){
  if (tourOverlayEl) return;
  tourStep = 0;
  tourOverlayEl = document.createElement("div");
  tourOverlayEl.className = "tour-overlay";
  tourOverlayEl.addEventListener("click", (e) => { if (e.target === tourOverlayEl) tourNext(); });
  document.body.appendChild(tourOverlayEl);

  tourTooltipEl = document.createElement("div");
  tourTooltipEl.className = "tour-tooltip";
  document.body.appendChild(tourTooltipEl);

  tourResizeHandler = () => tourPositionTooltip();
  window.addEventListener("resize", tourResizeHandler);
  window.addEventListener("scroll", tourResizeHandler, { passive: true });

  tourShowStep(0);
}

function tourShowStep(i){
  if (tourHighlightEl) { tourHighlightEl.classList.remove("tour-highlight"); tourHighlightEl = null; }
  if (i >= TOUR_STEPS.length) { endTour(true); return; }
  const step = TOUR_STEPS[i];
  const target = document.querySelector(step.selector);
  if (!target) { tourShowStep(i + 1); return; }
  tourStep = i;
  target.classList.add("tour-highlight");
  tourHighlightEl = target;
  target.scrollIntoView({ behavior: "auto", block: "center" });

  tourTooltipEl.innerHTML = `
    <div class="tour-step-count">Passo ${i + 1} de ${TOUR_STEPS.length}</div>
    <h4>${escapeHtml(step.title)}</h4>
    <p>${escapeHtml(step.text)}</p>
    <div class="tour-btns">
      <button type="button" class="btn ghost" id="tour-skip">Pular tour</button>
      <div class="tour-dots">${TOUR_STEPS.map((_, di) => `<span class="tour-dot ${di === i ? "active" : ""}"></span>`).join("")}</div>
      <button type="button" class="btn primary" id="tour-next">${i === TOUR_STEPS.length - 1 ? "Concluir" : "Próximo"}</button>
    </div>`;
  document.getElementById("tour-skip").addEventListener("click", () => endTour(true));
  document.getElementById("tour-next").addEventListener("click", tourNext);

  setTimeout(tourPositionTooltip, 30);
}

function tourNext(){ tourShowStep(tourStep + 1); }

function tourPositionTooltip(){
  if (!tourHighlightEl || !tourTooltipEl) return;
  const rect = tourHighlightEl.getBoundingClientRect();
  const tw = tourTooltipEl.offsetWidth;
  const th = tourTooltipEl.offsetHeight;
  let top = rect.bottom + 16;
  if (top + th > window.innerHeight - 16) top = Math.max(16, rect.top - th - 16);
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.min(Math.max(16, left), window.innerWidth - tw - 16);
  tourTooltipEl.style.top = top + "px";
  tourTooltipEl.style.left = left + "px";
}

function endTour(markSeen){
  if (tourHighlightEl) tourHighlightEl.classList.remove("tour-highlight");
  if (tourOverlayEl) tourOverlayEl.remove();
  if (tourTooltipEl) tourTooltipEl.remove();
  if (tourResizeHandler) { window.removeEventListener("resize", tourResizeHandler); window.removeEventListener("scroll", tourResizeHandler); }
  tourOverlayEl = null; tourTooltipEl = null; tourHighlightEl = null; tourResizeHandler = null;
  if (markSeen && currentUserEmail) {
    const member = teamMember(currentUserEmail);
    if (member) member.tourSeen = true;
    fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourSeen: true })
    }).catch(() => {});
  }
}

function maybeStartTour(){
  if (tourShouldRun()) setTimeout(startTour, 700);
}
