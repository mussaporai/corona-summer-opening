const { verify, parseCookies } = require("../lib/session");
const { getGoogleAuth, saveGoogleAuth } = require("../lib/kv-google");

const ADMIN_EMAIL = "marcelo.mussa@hotmail.com";

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }

  if (req.method === "GET") {
    const g = await getGoogleAuth();
    res.status(200).json({ connected: !!g.connected, connectedBy: g.connectedBy || "" });
    return;
  }

  if (req.method === "POST") {
    if (session.email.toLowerCase() !== ADMIN_EMAIL) {
      res.status(403).json({ error: "só o produtor master pode desconectar o Google Calendar" });
      return;
    }
    await saveGoogleAuth({ connected: false, refreshToken: "", connectedBy: "", connectedAt: 0 });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "método não suportado" });
};
