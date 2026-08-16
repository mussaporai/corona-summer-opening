const { verify, parseCookies } = require("../lib/session");
const { getState, saveState } = require("../lib/kv-state");
const { applyMutation } = require("../lib/mutations");

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }

  if (req.method === "GET") {
    const state = await getState();
    res.status(200).json(state);
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
    try {
      const state = await getState();
      applyMutation(state, type, payload, session.email);
      await saveState(state);
      res.status(200).json(state);
    } catch (err) {
      res.status(400).json({ error: err.message || "falha ao aplicar mutação" });
    }
    return;
  }

  res.status(405).json({ error: "método não suportado" });
};
