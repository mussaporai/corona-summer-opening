// Renderização compartilhada das 7 páginas de frente do checklist.
// Cada página HTML define `const CAT_NUM = N;` antes de incluir este script.

function render(){
  renderOwnerCard();
  renderCategoryHead();
  renderItems();
  renderBell();
}

function currentCat(){ return state.categories.find(c => c.num === CAT_NUM); }

function renderOwnerCard(){
  const el = document.getElementById("owner-card");
  if (!el) return;
  const ownerEmail = (teamData.categoryOwners || {})[String(CAT_NUM)];
  const member = ownerEmail ? teamMember(ownerEmail) : null;
  if (!member) {
    el.innerHTML = `<div class="owner-card empty">Responsável desta frente ainda não foi definido.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="owner-card">
      <div class="oc-avatar">${member.photo ? `<img src="${member.photo}" alt="">` : (member.name||member.email).charAt(0).toUpperCase()}</div>
      <div class="oc-info">
        <div class="oc-name">${escapeHtml(member.name || member.email)}</div>
        <div class="oc-role">${escapeHtml(member.position || "")}</div>
        <div class="oc-contact">
          <span>${escapeHtml(member.email)}</span>
          ${member.phone ? `<span>${escapeHtml(member.phone)}</span>` : ""}
        </div>
      </div>
    </div>`;
}

function renderCategoryHead(){
  const c = currentCat();
  const catTotal = c.items.reduce((s,i)=>s+Number(i.val||0),0);
  document.getElementById("cat-title").textContent = `${c.num}. ${c.name}`;
  document.getElementById("cat-title").setAttribute("data-cat", c.num);
  document.getElementById("cat-intro").textContent = c.intro;
  document.getElementById("cat-intro").setAttribute("data-cat", c.num);
  document.getElementById("cat-meta").textContent = `${c.items.length} itens · ${fmt(catTotal)}`;
  document.title = `${c.num}. ${c.name} — Corona Summer Opening`;
}

const openReplyForms = new Set();

function renderItems(){
  const c = currentCat();
  const openIds = new Set(Array.from(document.querySelectorAll(".item[open]")).map(d => d.dataset.id));
  document.getElementById("items-list").innerHTML = c.items.map(it => renderItem(it, c, openIds)).join("");
}

function renderItem(it, c, openIds){
  const done = it.radar.filter(r=>r.done).length;
  const isOpen = openIds.has(it.id);
  const overdue = isOverdue(it);
  return `
  <details class="item ${overdue ? 'is-overdue' : ''}" style="--cc:var(--${c.key})" data-id="${it.id}" ${isOpen ? "open" : ""}>
    <summary>
      <div class="left">
        <span class="code">${escapeHtml(it.code)}</span>
        <span class="name" contenteditable="true" data-action="edit-item-name" data-item="${it.id}" onclick="event.stopPropagation()">${escapeHtml(it.name)}</span>
        ${overdue ? `<span class="overdue-badge">${daysOverdue(it)}d atrasado</span>` : ""}
      </div>
      <div class="right">
        <div class="status-pair" onclick="event.stopPropagation()">
          <label class="status-chip ${it.started?'on-started':''}"><input type="checkbox" ${it.started?"checked":""} data-action="toggle-started" data-item="${it.id}"> Iniciado</label>
          <label class="status-chip ${it.completed?'on-completed':''}"><input type="checkbox" ${it.completed?"checked":""} data-action="toggle-completed" data-item="${it.id}"> Concluído</label>
        </div>
        <span class="item-progress">${done}/${it.radar.length}</span>
        <span class="val-wrap">R$ <input type="text" value="${it.val}" data-action="edit-item-val" data-item="${it.id}" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')this.blur()"></span>
        <span class="chev">▶</span>
      </div>
    </summary>
    <div class="item-body">
      <div class="section-label">Fornecedor</div>
      <div class="supplier-grid">
        <div><span class="field-label">Fornecedor</span><input type="text" placeholder="Nome do fornecedor" value="${escapeHtml(it.supplier||"")}" data-action="edit-item-field" data-field="supplier" data-item="${it.id}"></div>
        <div><span class="field-label">Contato de referência</span><input type="text" placeholder="Nome do contato" value="${escapeHtml(it.contact||"")}" data-action="edit-item-field" data-field="contact" data-item="${it.id}"></div>
        <div><span class="field-label">Telefone</span><input type="text" placeholder="(00) 00000-0000" value="${escapeHtml(it.phone||"")}" data-action="edit-item-field" data-field="phone" data-item="${it.id}"></div>
        <div><span class="field-label">Link ou PDF da proposta</span><input type="text" placeholder="Cole o link da proposta" value="${escapeHtml(it.proposalLink||"")}" data-action="edit-item-field" data-field="proposalLink" data-item="${it.id}"></div>
        <div><span class="field-label">Prazo de entrega</span><input type="date" value="${escapeHtml(it.deadline||"")}" data-action="edit-item-field" data-field="deadline" data-item="${it.id}"></div>
        <textarea placeholder="Observações sobre esta linha..." data-action="edit-item-field" data-field="notes" data-item="${it.id}">${escapeHtml(it.notes||"")}</textarea>
      </div>

      <div class="section-label">Subitens</div>
      <ul class="radar">
        ${it.radar.map(r => `
          <li class="${r.done ? "done" : ""}">
            <input type="checkbox" ${r.done?"checked":""} data-action="toggle-radar" data-item="${it.id}" data-radar="${r.id}">
            <span class="rtext" contenteditable="true" data-action="edit-radar-text" data-item="${it.id}" data-radar="${r.id}">${escapeHtml(r.t)}</span>
            <button class="rm-radar" data-action="rm-radar" data-item="${it.id}" data-radar="${r.id}" title="Remover">✕</button>
          </li>`).join("")}
      </ul>
      <button class="add-radar" data-action="add-radar" data-item="${it.id}">+ adicionar subitem</button>

      <div class="comments">
        <div class="section-label">Comentários</div>
        ${it.comments.length ? it.comments.map(cm => renderComment(cm, it)).join("") : `<div class="no-comments">Nenhum comentário ainda.</div>`}
        <div class="comment-add">
          <textarea placeholder="Pergunta ou comentário sobre este item..." data-item="${it.id}" data-role="comment-input"></textarea>
          <button class="btn primary" data-action="add-comment" data-item="${it.id}">Comentar</button>
        </div>
      </div>

      <div class="item-toolbar">
        <span></span>
        <button class="btn danger-item" data-action="rm-item" data-item="${it.id}">Remover linha</button>
      </div>
    </div>
  </details>`;
}

function renderComment(cm, it){
  const formOpen = openReplyForms.has(cm.id);
  return `
    <div class="comment" data-comment="${cm.id}">
      <div class="meta"><span class="cauthor">${escapeHtml(cm.who)}</span><span>${fmtTs(cm.ts)}</span></div>
      <div>${escapeHtml(cm.text)}</div>
      ${(cm.replies||[]).length ? `<div class="replies">${cm.replies.map(rp => `
        <div class="reply"><div class="meta"><span class="cauthor">${escapeHtml(rp.who)}</span><span>${fmtTs(rp.ts)}</span></div><div>${escapeHtml(rp.text)}</div></div>
      `).join("")}</div>` : ""}
      <button class="reply-add-btn" data-action="toggle-reply-form" data-item="${it.id}" data-comment="${cm.id}">${formOpen ? "Cancelar" : "Responder"}</button>
      ${formOpen ? `
        <div class="reply-form">
          <textarea placeholder="Escreva sua resposta..." data-role="reply-input" data-item="${it.id}" data-comment="${cm.id}"></textarea>
          <button class="btn primary" data-action="add-reply" data-item="${it.id}" data-comment="${cm.id}">Enviar</button>
        </div>` : ""}
    </div>`;
}

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;

  if (action === "add-item") {
    await mutate("add-item", { catNum: CAT_NUM });
    const c = currentCat();
    const newItem = c.items[c.items.length - 1];
    render();
    setTimeout(() => {
      const d = document.querySelector(`.item[data-id="${newItem.id}"]`);
      if (d) { d.open = true; d.scrollIntoView({behavior:"smooth", block:"center"}); }
    }, 30);
  }

  if (action === "rm-item") {
    const found = findItemAndCat(t.dataset.item);
    if (!found) return;
    if (!confirm(`Remover a linha "${found.item.code} — ${found.item.name}"?`)) return;
    await mutate("rm-item", { itemId: found.item.id });
    render();
  }

  if (action === "add-radar") {
    await mutate("add-radar", { itemId: t.dataset.item });
    render();
    setTimeout(() => {
      const els = document.querySelectorAll(`.item[data-id="${t.dataset.item}"] .rtext`);
      const el = els[els.length - 1];
      if (el) { el.focus(); document.execCommand("selectAll", false, null); }
    }, 30);
  }

  if (action === "rm-radar") {
    await mutate("rm-radar", { itemId: t.dataset.item, radarId: t.dataset.radar });
    render();
  }

  if (action === "add-comment") {
    const ta = document.querySelector(`textarea[data-role="comment-input"][data-item="${t.dataset.item}"]`);
    const text = (ta.value || "").trim();
    if (!text) return;
    await mutate("add-comment", { itemId: t.dataset.item, text });
    render();
  }

  if (action === "toggle-reply-form") {
    if (openReplyForms.has(t.dataset.comment)) openReplyForms.delete(t.dataset.comment);
    else openReplyForms.add(t.dataset.comment);
    render();
    if (openReplyForms.has(t.dataset.comment)) {
      setTimeout(() => {
        const ta = document.querySelector(`textarea[data-role="reply-input"][data-comment="${t.dataset.comment}"]`);
        if (ta) ta.focus();
      }, 30);
    }
  }

  if (action === "add-reply") {
    const ta = document.querySelector(`textarea[data-role="reply-input"][data-comment="${t.dataset.comment}"]`);
    const text = (ta.value || "").trim();
    if (!text) return;
    await mutate("add-reply", { itemId: t.dataset.item, commentId: t.dataset.comment, text });
    openReplyForms.delete(t.dataset.comment);
    render();
  }
});

document.addEventListener("change", async e => {
  if (e.target.dataset.action === "toggle-radar") {
    await mutate("toggle-radar", { itemId: e.target.dataset.item, radarId: e.target.dataset.radar, done: e.target.checked });
    render();
  }
  if (e.target.dataset.action === "toggle-started") {
    await mutate("toggle-started", { itemId: e.target.dataset.item, value: e.target.checked });
    render();
  }
  if (e.target.dataset.action === "toggle-completed") {
    await mutate("toggle-completed", { itemId: e.target.dataset.item, value: e.target.checked });
    render();
  }
});

document.addEventListener("focusout", async e => {
  const el = e.target;
  const action = el.dataset && el.dataset.action;
  if (!action) return;

  if (action === "edit-cat-name") {
    const c = currentCat();
    const val = el.textContent.trim() || c.name;
    if (val !== c.name) await mutate("edit-cat-name", { catNum: CAT_NUM, value: val });
  }
  if (action === "edit-cat-intro") {
    const c = currentCat();
    const val = el.textContent.trim();
    if (val !== c.intro) await mutate("edit-cat-intro", { catNum: CAT_NUM, value: val });
  }
  if (action === "edit-item-name") {
    const found = findItemAndCat(el.dataset.item);
    if (!found) return;
    const val = el.textContent.trim() || found.item.name;
    if (val !== found.item.name) await mutate("edit-item-name", { itemId: found.item.id, value: val });
  }
  if (action === "edit-item-val") {
    const found = findItemAndCat(el.dataset.item);
    if (!found) return;
    const num = Number(String(el.value).replace(/[^\d.-]/g,"")) || 0;
    if (num !== found.item.val) { await mutate("edit-item-val", { itemId: found.item.id, value: num }); renderItems(); return; }
  }
  if (action === "edit-item-field") {
    const found = findItemAndCat(el.dataset.item);
    if (!found) return;
    const field = el.dataset.field;
    const val = getElVal(el).trim();
    if (val !== (found.item[field]||"")) {
      await mutate("edit-item-field", { itemId: found.item.id, field, value: val });
      if (field === "deadline") renderItems();
    }
  }
  if (action === "edit-radar-text") {
    const found = findItemAndCat(el.dataset.item);
    if (!found) return;
    const r = found.item.radar.find(r => r.id === el.dataset.radar);
    if (!r) return;
    const val = el.textContent.trim() || r.t;
    if (val !== r.t) await mutate("edit-radar-text", { itemId: found.item.id, radarId: r.id, value: val });
  }
}, true);

authReady.then(async () => {
  await fetchState();
  render();
  startPolling(render);
});
