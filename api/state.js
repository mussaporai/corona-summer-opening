const { verify, parseCookies } = require("../lib/session");
const { getState, saveState, getStateWithVersion, saveStateIfUnchanged } = require("../lib/kv-state");
const { applyMutation, findItemAndCat } = require("../lib/mutations");
const { getTeam } = require("../lib/kv-team");
const { syncMeetingToGoogle } = require("../lib/google-sync");

const ADMIN_EMAIL = "marcelo.mussa@hotmail.com";
const VALUE_RESTRICTED_TYPES = new Set(["edit-item-val"]);
const OWNER_RESTRICTED_TYPES = new Set(["rm-item", "rm-radar", "remove-fornecedor"]);
const ADMIN_ONLY_DESTRUCTIVE_TYPES = new Set(["rm-meeting", "rm-file"]);
const FILE_RESTRICTION_TYPES = new Set(["set-file-restriction"]);
const GOOGLE_SYNC_TYPES = new Set(["edit-meeting-field", "add-meeting-participant", "remove-meeting-participant", "rm-meeting"]);

// Arquivos com restrictedTo não-vazio só aparecem pra quem está na lista, pro
// admin, e pros assistentes de produção master (que também gerenciam a biblioteca).
// Filtra sempre numa cópia rasa — nunca no objeto que acabou de ser persistido.
async function withVisibleFiles(state, email) {
  const lower = (email || "").toLowerCase();
  if (lower === ADMIN_EMAIL) return state;
  const team = await getTeam();
  if ((team.masterAssistants || []).map(e => e.toLowerCase()).includes(lower)) return state;
  const files = (state.files || []).filter(f => {
    if (!f.restrictedTo || !f.restrictedTo.length) return true;
    return f.restrictedTo.map(e => e.toLowerCase()).includes(lower);
  });
  return { ...state, files };
}

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }

  if (req.method === "GET") {
    const state = await getState();
    res.status(200).json(await withVisibleFiles(state, session.email));
    return;
  }

  if (req.method === "POST") {
    const { type, payload } = req.body || {};
    if (!type) {
      res.status(400).json({ error: "tipo de mutação obrigatório" });
      return;
    }
    if (type === "bulk-replace") {
      if (session.email.toLowerCase() !== "marcelo.mussa@hotmail.com") {
        res.status(403).json({ error: "apenas o administrador master pode restaurar um backup" });
        return;
      }
      const incoming = payload && payload.state;
      if (!incoming || !incoming.categories) {
        res.status(400).json({ error: "backup inválido" });
        return;
      }
      await saveState(incoming);
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
    if (OWNER_RESTRICTED_TYPES.has(type) || ADMIN_ONLY_DESTRUCTIVE_TYPES.has(type)) {
      const email = session.email.toLowerCase();
      if (email !== ADMIN_EMAIL) {
        const team = await getTeam();
        let allowed = (team.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
        if (!allowed && OWNER_RESTRICTED_TYPES.has(type) && payload && payload.itemId) {
          const currentState = await getState();
          const found = findItemAndCat(currentState, payload.itemId);
          if (found) {
            const ownerEmail = (team.categoryOwners || {})[String(found.cat.num)];
            allowed = !!ownerEmail && ownerEmail.toLowerCase() === email;
          }
        }
        if (!allowed) {
          res.status(403).json({ error: "só o produtor master, o assistente de produção master ou o responsável desta frente podem remover" });
          return;
        }
      }
    }
    try {
      let state, saved = false;
      for (let attempt = 0; !saved; attempt++) {
        const entry = await getStateWithVersion();
        state = entry.value;
        applyMutation(state, type, payload, session.email);
        saved = await saveStateIfUnchanged(state, entry.version);
        if (!saved && attempt >= 4) {
          throw new Error("conflito de edição simultânea, tente novamente");
        }
      }
      if (GOOGLE_SYNC_TYPES.has(type)) {
        await syncMeetingToGoogle(type, payload, state);
      }
      res.status(200).json(await withVisibleFiles(state, session.email));
    } catch (err) {
      res.status(400).json({ error: err.message || "falha ao aplicar mutação" });
    }
    return;
  }

  res.status(405).json({ error: "método não suportado" });
};
