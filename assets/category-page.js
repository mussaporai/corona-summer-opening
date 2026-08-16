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
      <div class="oc-avatar">${member.photo ? `<img src="${escapeHtml(member.photo)}" alt="">` : (member.name||member.email).charAt(0).toUpperCase()}</div>
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

function subitemCode(item, index){ return `${item.code}.${index+1}`; }

function renderCategoryHead(){
  const c = currentCat();
  const catTotal = c.items.reduce((s,i)=>s+Number(i.val||0),0);
  document.getElementById("cat-title").textContent = `Seção ${c.num} — ${c.name}`;
  document.getElementById("cat-title").setAttribute("data-cat", c.num);
  document.getElementById("cat-intro").textContent = c.intro;
  document.getElementById("cat-intro").setAttribute("data-cat", c.num);
  document.getElementById("cat-meta").textContent = `${c.items.length} itens · ${fmt(catTotal)}`;
  document.title = `${c.num}. ${c.name} — Corona Summer Opening`;
  const deadlineRow = document.getElementById("cat-deadline-row");
  if (deadlineRow) {
    deadlineRow.innerHTML = `
      <div class="cat-deadline-row">
        <span class="field-label">Prazo desta seção</span>
        <input type="date" value="${escapeHtml(c.deadline||"")}" data-action="edit-cat-field" data-field="deadline" data-cat="${c.num}">
      </div>`;
  }
}

const openReplyForms = new Set();
const pendingUploads = new Map();

async function attemptUpload(file, { itemId, radarId, fornecedorId, field }, label, retryBtn){
  if (retryBtn) retryBtn.remove();
  if (label) label.textContent = "…";
  try {
    const found = findItemAndCat(itemId);
    const r = found.item.radar.find(r => r.id === radarId);
    const folder = `fornecedores/cat${CAT_NUM}/${found.item.code}/${r ? subitemCode(found.item, found.item.radar.indexOf(r)) : radarId}/${fornecedorId}`;
    const key = await uploadFileToR2(file, folder);
    await mutate("edit-fornecedor-field", { itemId, radarId, fornecedorId, field, value: "r2:" + key });
    pendingUploads.delete(itemId + "|" + radarId + "|" + fornecedorId + "|" + field);
    render();
  } catch (err) {
    toast("Falha no upload: " + (err.message || "tente de novo."), { persistent: true });
    if (label) {
      label.textContent = "📎";
      const pendingKey = itemId + "|" + radarId + "|" + fornecedorId + "|" + field;
      pendingUploads.set(pendingKey, file);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "retry-upload-btn";
      btn.textContent = "↻ Tentar de novo";
      btn.dataset.action = "retry-upload";
      btn.dataset.item = itemId;
      btn.dataset.radar = radarId;
      btn.dataset.fornecedor = fornecedorId;
      btn.dataset.field = field;
      btn.dataset.pendingKey = pendingKey;
      label.insertAdjacentElement("afterend", btn);
    }
  }
}

function renderItems(){
  const c = currentCat();
  const openIds = new Set(Array.from(document.querySelectorAll(".item[open]")).map(d => d.dataset.id));
  const openSubIds = new Set(Array.from(document.querySelectorAll(".subitem[open]")).map(d => d.dataset.radarId));
  document.getElementById("items-list").innerHTML = c.items.map(it => renderItem(it, c, openIds, openSubIds)).join("");
}

function renderItem(it, c, openIds, openSubIds){
  const done = it.radar.filter(r=>r.done).length;
  const isOpen = openIds.has(it.id);
  const overdue = isOverdue(it.deadline, it.completed);
  return `
  <details class="item ${overdue ? 'is-overdue' : ''}" style="--cc:var(--${c.key})" data-id="${it.id}" ${isOpen ? "open" : ""}>
    <summary>
      <div class="left">
        <span class="code">${escapeHtml(it.code)}</span>
        <span class="name" contenteditable="true" data-action="edit-item-name" data-item="${it.id}" onclick="event.stopPropagation()">${escapeHtml(it.name)}</span>
        ${overdue ? `<span class="overdue-badge">${daysOverdue(it.deadline, it.completed)}d atrasado</span>` : ""}
        ${(it.blockedBy||[]).length ? `<span class="blocked-badge" title="Bloqueado por outro item">🔒 Bloqueado</span>` : ""}
      </div>
      <div class="right">
        <div class="status-pair" onclick="event.stopPropagation()">
          <label class="status-chip ${it.started?'on-started':''}"><input type="checkbox" ${it.started?"checked":""} data-action="toggle-started" data-item="${it.id}"> Iniciado</label>
          <label class="status-chip ${it.completed?'on-completed':''}"><input type="checkbox" ${it.completed?"checked":""} data-action="toggle-completed" data-item="${it.id}"> Concluído</label>
        </div>
        <span class="item-progress">${done}/${it.radar.length}</span>
        <span class="val-wrap">${canEditValues()
          ? `R$ <input type="text" value="${it.val}" data-action="edit-item-val" data-item="${it.id}" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')this.blur()">`
          : `<span class="val-readonly" title="Só o produtor master e o assistente de produção master podem alterar valores">${fmt(it.val)}</span>`}</span>
        <span class="chev">▶</span>
      </div>
    </summary>
    <div class="item-body">
      <div class="section-label">Linha ${escapeHtml(it.code)} — Prazo de entrega</div>
      <input type="date" value="${escapeHtml(it.deadline||"")}" data-action="edit-item-field" data-field="deadline" data-item="${it.id}" style="max-width:200px;">

      ${renderBlockedBy(it)}

      <div class="section-label">Subitens</div>
      <div class="radar">
        ${it.radar.map((r,idx) => renderSubitem(r, idx, it, openSubIds)).join("")}
      </div>
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
        ${canDeleteInCat(CAT_NUM) ? `<button class="btn danger-item" data-action="rm-item" data-item="${it.id}">Remover linha</button>` : ""}
      </div>
    </div>
  </details>`;
}

function findItemByCode(code){
  for (const c of state.categories) {
    const it = c.items.find(i => i.code === code);
    if (it) return { item: it, cat: c };
  }
  return null;
}

function renderBlockedBy(it){
  const blocks = (it.blockedBy || []).map(id => {
    const found = findItemAndCat(id);
    return found ? { id, code: found.item.code, name: found.item.name, catNum: found.cat.num } : null;
  }).filter(Boolean);
  return `
    <div class="section-label">Bloqueado por</div>
    <div class="blocked-list">
      ${blocks.length ? blocks.map(b => `
        <span class="blocked-chip">
          <a href="${CAT_PAGES[b.catNum]}">${escapeHtml(b.code)} — ${escapeHtml(b.name)}</a>
          <button type="button" data-action="remove-item-block" data-item="${it.id}" data-blocker="${b.id}" title="Remover bloqueio">✕</button>
        </span>
      `).join("") : `<div class="no-comments">Nenhum bloqueio — a linha está livre pra andar.</div>`}
    </div>
    <div class="block-add-row">
      <input type="text" placeholder="Código do item que bloqueia (ex: 3.2)" data-role="block-code-input" data-item="${it.id}">
      <button type="button" class="btn" data-action="add-item-block" data-item="${it.id}">+ Adicionar bloqueio</button>
    </div>
  `;
}

function renderSubitem(r, idx, it, openSubIds){
  const code = subitemCode(it, idx);
  const isOpen = openSubIds.has(r.id);
  const fCount = (r.fornecedores || []).length;
  return `
  <details class="subitem ${r.done ? 'done' : ''}" data-radar-id="${r.id}" ${isOpen ? "open" : ""}>
    <summary>
      <input type="checkbox" ${r.done?"checked":""} data-action="toggle-radar" data-item="${it.id}" data-radar="${r.id}" onclick="event.stopPropagation()">
      <span class="sub-code">${code}</span>
      <span class="rtext" contenteditable="true" data-action="edit-radar-text" data-item="${it.id}" data-radar="${r.id}" onclick="event.stopPropagation()">${escapeHtml(r.t)}</span>
      ${r.deadline ? `<span class="sub-deadline-badge ${isOverdue(r.deadline, r.done) ? "is-overdue" : ""}">${escapeHtml(r.deadline.split("-").reverse().join("/"))}</span>` : ""}
      ${fCount ? `<span class="sub-fornecedor-count">${fCount} fornecedor${fCount>1?"es":""}</span>` : ""}
      ${canDeleteInCat(CAT_NUM) ? `<button class="rm-radar" data-action="rm-radar" data-item="${it.id}" data-radar="${r.id}" title="Remover" onclick="event.stopPropagation()">✕</button>` : ""}
      <span class="chev-sub">▶</span>
    </summary>
    <div class="subitem-body">
      <div class="field-label-sm">Sub Item ${code} — Prazo de entrega</div>
      <input type="date" value="${escapeHtml(r.deadline||"")}" data-action="edit-radar-field" data-field="deadline" data-item="${it.id}" data-radar="${r.id}">

      <div class="field-label-sm">Fornecedores</div>
      <div class="fornecedor-list">
        ${(r.fornecedores||[]).length ? r.fornecedores.map(f => renderFornecedor(f, it, r)).join("") : `<div class="no-fornecedores">Nenhum fornecedor cadastrado ainda.</div>`}
      </div>
      <button class="add-fornecedor-btn" data-action="add-fornecedor" data-item="${it.id}" data-radar="${r.id}">+ Adicionar fornecedor</button>
    </div>
  </details>`;
}

function renderFornecedor(f, it, r){
  return `
    <div class="fornecedor-card" data-fornecedor="${f.id}">
      <div class="fornecedor-grid">
        <div><span class="field-label">Fornecedor</span><input type="text" placeholder="NOME DO FORNECEDOR" value="${escapeHtml(f.supplier||"")}" data-action="edit-fornecedor-field" data-field="supplier" data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}" oninput="this.value=this.value.toUpperCase()"></div>
        <div><span class="field-label">Nome do contato</span><input type="text" placeholder="NOME DO CONTATO" value="${escapeHtml(f.contact||"")}" data-action="edit-fornecedor-field" data-field="contact" data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}" oninput="this.value=this.value.toUpperCase()"></div>
        <div><span class="field-label">Telefone</span><input type="text" placeholder="TELEFONE" value="${escapeHtml(f.phone||"")}" data-action="edit-fornecedor-field" data-field="phone" data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}" oninput="this.value=this.value.toUpperCase()"></div>
      </div>
      <div class="fornecedor-grid">
        <div><span class="field-label">Proposta</span>${renderFileField(f.proposalLink, `data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}" data-field="proposalLink"`)}</div>
        <div><span class="field-label">Arquivos do fornecedor</span>${renderFileField(f.filesLink, `data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}" data-field="filesLink"`)}</div>
      </div>
      <textarea placeholder="Notas & observações sobre este fornecedor..." data-action="edit-fornecedor-field" data-field="notes" data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}">${escapeHtml(f.notes||"")}</textarea>
      <div class="fornecedor-footer">
        <div class="accept-pair">
          <span class="field-label">Aceito</span>
          <button type="button" class="accept-btn yes ${f.accepted===true?'active':''}" data-action="set-fornecedor-accepted" data-value="true" data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}">Sim</button>
          <button type="button" class="accept-btn no ${f.accepted===false?'active':''}" data-action="set-fornecedor-accepted" data-value="false" data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}">Não</button>
        </div>
        ${canDeleteInCat(CAT_NUM) ? `<button type="button" class="rm-fornecedor" data-action="remove-fornecedor" data-item="${it.id}" data-radar="${r.id}" data-fornecedor="${f.id}" title="Remover fornecedor">✕ Remover</button>` : ""}
      </div>
    </div>`;
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
  if (action === "add-item-block") {
    const itemId = t.dataset.item;
    const input = document.querySelector(`[data-role="block-code-input"][data-item="${itemId}"]`);
    const code = input ? input.value.trim() : "";
    if (!code) return;
    const found = findItemByCode(code);
    if (!found) { toast(`Não achei nenhum item com o código "${code}".`); return; }
    if (found.item.id === itemId) { toast("Um item não pode bloquear a si mesmo."); return; }
    await mutate("add-item-block", { itemId, blockerId: found.item.id });
    render();
  }
  if (action === "remove-item-block") {
    await mutate("remove-item-block", { itemId: t.dataset.item, blockerId: t.dataset.blocker });
    render();
  }

  if (action === "add-fornecedor") {
    await mutate("add-fornecedor", { itemId: t.dataset.item, radarId: t.dataset.radar });
    render();
  }

  if (action === "open-r2-file") {
    openR2File(t.dataset.key);
  }

  if (action === "clear-file") {
    if (!confirm("Remover este arquivo/link?")) return;
    await mutate("edit-fornecedor-field", { itemId: t.dataset.item, radarId: t.dataset.radar, fornecedorId: t.dataset.fornecedor, field: t.dataset.field, value: "" });
    render();
  }

  if (action === "remove-fornecedor") {
    await mutate("remove-fornecedor", { itemId: t.dataset.item, radarId: t.dataset.radar, fornecedorId: t.dataset.fornecedor });
    render();
  }

  if (action === "set-fornecedor-accepted") {
    const found = findItemAndCat(t.dataset.item);
    if (!found) return;
    const r = found.item.radar.find(r => r.id === t.dataset.radar);
    if (!r) return;
    const f = (r.fornecedores||[]).find(f => f.id === t.dataset.fornecedor);
    if (!f) return;
    const clicked = t.dataset.value === "true";
    const value = f.accepted === clicked ? null : clicked;
    await mutate("set-fornecedor-accepted", { itemId: t.dataset.item, radarId: t.dataset.radar, fornecedorId: t.dataset.fornecedor, value });
    render();
  }

  if (action === "add-radar") {
    await mutate("add-radar", { itemId: t.dataset.item });
    render();
    setTimeout(() => {
      const subs = document.querySelectorAll(`.item[data-id="${t.dataset.item}"] .subitem`);
      const last = subs[subs.length - 1];
      if (!last) return;
      last.open = true;
      const el = last.querySelector(".rtext");
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
    const found = findItemAndCat(e.target.dataset.item);
    if (e.target.checked && found && found.item.radar.length && found.item.radar.some(r => !r.done)) {
      e.target.checked = false;
      toast("Conclua todos os subitens antes de marcar esta linha como concluída.");
      return;
    }
    await mutate("toggle-completed", { itemId: e.target.dataset.item, value: e.target.checked });
    render();
  }
  if (e.target.dataset.action === "upload-file") {
    const el = e.target;
    const file = el.files[0];
    if (!file) return;
    const { item: itemId, radar: radarId, fornecedor: fornecedorId, field } = el.dataset;
    attemptUpload(file, { itemId, radarId, fornecedorId, field }, el.closest(".upload-btn"));
  }
  if (e.target.dataset.action === "retry-upload") {
    const btn = e.target;
    const { item: itemId, radar: radarId, fornecedor: fornecedorId, field } = btn.dataset;
    const file = pendingUploads.get(btn.dataset.pendingKey);
    if (!file) return;
    attemptUpload(file, { itemId, radarId, fornecedorId, field }, btn.previousElementSibling, btn);
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
  if (action === "edit-fornecedor-field") {
    const found = findItemAndCat(el.dataset.item);
    if (!found) return;
    const r = found.item.radar.find(r => r.id === el.dataset.radar);
    if (!r) return;
    const f = (r.fornecedores||[]).find(f => f.id === el.dataset.fornecedor);
    if (!f) return;
    const field = el.dataset.field;
    let val = getElVal(el).trim();
    if (["supplier","contact","phone"].includes(field)) val = val.toUpperCase();
    if (val !== (f[field]||"")) {
      await mutate("edit-fornecedor-field", { itemId: found.item.id, radarId: r.id, fornecedorId: f.id, field, value: val });
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
  if (action === "edit-radar-field") {
    const found = findItemAndCat(el.dataset.item);
    if (!found) return;
    const r = found.item.radar.find(r => r.id === el.dataset.radar);
    if (!r) return;
    const field = el.dataset.field;
    const val = getElVal(el).trim();
    if (val !== (r[field]||"")) {
      await mutate("edit-radar-field", { itemId: found.item.id, radarId: r.id, field, value: val });
      if (field === "deadline") renderItems();
    }
  }
  if (action === "edit-cat-field") {
    const c = currentCat();
    const field = el.dataset.field;
    const val = getElVal(el).trim();
    if (val !== (c[field]||"")) {
      await mutate("edit-cat-field", { catNum: CAT_NUM, field, value: val });
    }
  }
}, true);

authReady.then(async () => {
  await fetchState();
  render();
  startPolling(render);
});
