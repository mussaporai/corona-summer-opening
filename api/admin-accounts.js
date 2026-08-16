const { verify, parseCookies } = require("./lib/session");
const { getAuthStore, setUserPassword, generateTempPassword } = require("./lib/auth-store");
const APPROVED = require("../data/approved-emails.json");

const ADMIN_EMAIL = "marcelo.mussa@hotmail.com";

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email || session.email.toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: "apenas o administrador master pode acessar" });
    return;
  }

  if (req.method === "GET") {
    const store = await getAuthStore();
    const accounts = APPROVED.map(email => {
      const key = email.toLowerCase();
      const u = store.users[key];
      return {
        email,
        hasAccount: !!u,
        mustChangePassword: u ? !!u.mustChangePassword : null,
        lastLogin: u ? u.lastLogin || null : null,
        createdAt: u ? u.createdAt || null : null
      };
    });
    res.status(200).json({ accounts });
    return;
  }

  if (req.method === "POST") {
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    if (!APPROVED.map(e => e.toLowerCase()).includes(email)) {
      res.status(400).json({ error: "e-mail não está na lista de aprovados" });
      return;
    }
    const tempPassword = generateTempPassword();
    await setUserPassword(email, tempPassword, true);
    res.status(200).json({ ok: true, email, tempPassword });
    return;
  }

  res.status(405).json({ error: "método não suportado" });
};
