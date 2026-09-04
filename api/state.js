const { verify, parseCookies, venueFromReq } = require("../lib/session");
const { getState, saveState, getStateWithVersion, saveStateIfUnchanged } = require("../lib/kv-state");
const { getFiles, getFilesWithVersion, saveFilesIfUnchanged } = require("../lib/kv-files");
const { applyMutation, findItemAndCat } = require("../lib/mutations");
const { getTeam } = require("../lib/kv-team");
const { withErrorHandling } = require("../lib/with-error-handling");

const ADMIN_EMAIL = "marcelo.mussa@psdreamexperience.com.br";
const VALUE_RESTRICTED_TYPES = new Set(["edit-item-val"]);
const OWNER_RESTRICTED_TYPES = new Set(["rm-item", "rm-radar", "remove-fornecedor"]);
const ADMIN_ONLY_DESTRUCTIVE_TYPES = new Set(["rm-meeting", "rm-file", "replace-file-content"]);
const FILE_RESTRICTION_TYPES = new Set(["set-file-restriction"]);
// Biblioteca é compartilhada entre os locais — essas mutações não tocam o
// checklist de local nenhum, operam direto em corona:files.
const FILE_MUTATION_TYPES = new Set([
  "add-file", "rm-file", "toggle-file-favorite", "toggle-file-principal", "set-file-restriction",
  "edit-file-field", "replace-file-content", "add-file-note"
]);

// Arquivos com restrictedTo não-vazio continuam visíveis (nome, categoria, quem
// subiu) pra todo mundo — só quem não está na lista (e não é admin/assistente
// master) recebe uma versão "trancada": sem o link/chave real, então o card
// aparece travado e em washout, mas ninguém de fora consegue abrir o arquivo
// mesmo inspecionando a resposta da API. Nunca muda o objeto que acabou de
// ser persistido — sempre devolve cópias.
async function withVisibleFiles(payload, email) {
  const lower = (email || "").toLowerCase();
  if (lower === ADMIN_EMAIL) return payload;
  const team = await getTeam();
  if ((team.masterAssistants || []).map(e => e.toLowerCase()).includes(lower)) return payload;
  const files = (payload.files || []).map(f => {
    if (!f.restrictedTo || !f.restrictedTo.length) return f;
    const allowed = f.restrictedTo.map(e => e.toLowerCase()).includes(lower);
    if (allowed) return f;
    return { ...f, link: null, locked: true };
  });
  return { ...payload, files };
}

module.exports = withErrorHandling(async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }
  const venue = venueFromReq(req);

  if (req.method === "GET") {
    const [state, filesData] = await Promise.all([getState(venue), getFiles()]);
    const merged = { ...state, files: filesData.files };
    res.status(200).json(await withVisibleFiles(merged, session.email));
    return;
  }

  if (req.method === "POST") {
    const { type, payload } = req.body || {};
    if (!type) {
      res.status(400).json({ error: "tipo de mutação obrigatório" });
      return;
    }
    if (type === "bulk-replace") {
      if (session.email.toLowerCase() !== ADMIN_EMAIL) {
        res.status(403).json({ error: "apenas o administrador master pode restaurar um backup" });
        return;
      }
      const incoming = payload && payload.state;
      if (!incoming || !incoming.categories) {
        res.status(400).json({ error: "backup inválido" });
        return;
      }
      await saveState(venue, incoming);
      res.status(200).json(incoming);
      return;
    }
    if (VALUE_RESTRICTED_TYPES.has(type)) {
      const email = session.email.toLowerCase();
      if (email !== ADMIN_EMAIL) {
        const team = await getTeam();
        const allowed = (team.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
        if (!allowed) {
          res.status(403).json({ error: "só o produtor master e o assistente de produção master podem alterar valores" });
          return;
        }
      }
    }
    if (FILE_RESTRICTION_TYPES.has(type)) {
      const email = session.email.toLowerCase();
      if (email !== ADMIN_EMAIL) {
        const team = await getTeam();
        const allowed = (team.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
        if (!allowed) {
          res.status(403).json({ error: "só o produtor master e o assistente de produção master podem restringir arquivos" });
          return;
        }
      }
    }
    if (type === "edit-file-field" && payload && payload.field === "link") {
      const email = session.email.toLowerCase();
      if (email !== ADMIN_EMAIL) {
        const team = await getTeam();
        const isMasterAssistant = (team.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
        if (!isMasterAssistant) {
          const filesData = await getFiles();
          const f = (filesData.files || []).find(x => x.id === payload.id);
          if (f && f.restrictedTo && f.restrictedTo.length && !f.restrictedTo.map(e => e.toLowerCase()).includes(email)) {
            res.status(403).json({ error: "acesso restrito a este arquivo" });
            return;
          }
        }
      }
    }
    if (OWNER_RESTRICTED_TYPES.has(type) || ADMIN_ONLY_DESTRUCTIVE_TYPES.has(type)) {
      const email = session.email.toLowerCase();
      if (email !== ADMIN_EMAIL) {
        const team = await getTeam();
        let allowed = (team.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
        if (!allowed && OWNER_RESTRICTED_TYPES.has(type) && payload && payload.itemId) {
          const currentState = await getState(venue);
          const found = findItemAndCat(currentState, payload.itemId);
          if (found) {
            const raw = (team.categoryOwners || {})[String(found.cat.num)];
            const owners = Array.isArray(raw) ? raw : (raw ? [raw] : []);
            allowed = owners.some(e => (e || "").toLowerCase() === email);
          }
        }
        if (!allowed) {
          res.status(403).json({ error: "só o produtor master, o assistente de produção master ou o responsável desta frente podem remover" });
          return;
        }
      }
    }
    try {
      let mergedResult;
      if (FILE_MUTATION_TYPES.has(type)) {
        let filesData, saved = false;
        for (let attempt = 0; !saved; attempt++) {
          const entry = await getFilesWithVersion();
          filesData = entry.value;
          applyMutation(filesData, type, payload, session.email);
          saved = await saveFilesIfUnchanged(filesData, entry.version);
          if (!saved && attempt >= 4) {
            throw new Error("conflito de edição simultânea, tente novamente");
          }
        }
        const state = await getState(venue);
        mergedResult = { ...state, files: filesData.files };
      } else {
        let state, saved = false;
        for (let attempt = 0; !saved; attempt++) {
          const entry = await getStateWithVersion(venue);
          state = entry.value;
          applyMutation(state, type, payload, session.email);
          saved = await saveStateIfUnchanged(venue, state, entry.version);
          if (!saved && attempt >= 4) {
            throw new Error("conflito de edição simultânea, tente novamente");
          }
        }
        const filesData = await getFiles();
        mergedResult = { ...state, files: filesData.files };
      }
      res.status(200).json(await withVisibleFiles(mergedResult, session.email));
    } catch (err) {
      res.status(400).json({ error: err.message || "falha ao aplicar mutação" });
    }
    return;
  }

  res.status(405).json({ error: "método não suportado" });
});
