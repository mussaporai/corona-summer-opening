const { verify, parseCookies } = require("../lib/session");
const { getAuthUrl } = require("../lib/google-calendar");

const ADMIN_EMAIL = "marcelo.mussa@hotmail.com";

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }
  if (session.email.toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: "só o produtor master pode conectar o Google Calendar" });
    return;
  }
  res.writeHead(302, { Location: getAuthUrl() });
  res.end();
};
