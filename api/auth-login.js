const { sign, cookieHeader, SESSION_IDLE_MS } = require("../lib/session");
const { getUserAuth, verifyPassword, touchLastLogin } = require("../lib/auth-store");
const { getApprovedEmails } = require("../lib/kv-emails");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "método não suportado" });
    return;
  }
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");
  if (!email || !password) {
    res.status(400).json({ error: "informe e-mail e senha" });
    return;
  }
  const APPROVED = await getApprovedEmails();
  if (!APPROVED.map(e => e.toLowerCase()).includes(email)) {
    res.status(401).json({ error: "e-mail ou senha inválidos" });
    return;
  }
  const auth = await getUserAuth(email);
  if (!auth || !verifyPassword(password, auth.passwordHash)) {
    res.status(401).json({ error: "e-mail ou senha inválidos" });
    return;
  }

  const sessionToken = sign({ email, iat: Date.now(), mustChangePassword: !!auth.mustChangePassword, exp: Date.now() + SESSION_IDLE_MS });
  res.setHeader("Set-Cookie", cookieHeader(sessionToken, Math.floor(SESSION_IDLE_MS / 1000)));
  await touchLastLogin(email);
  res.status(200).json({ ok: true, mustChangePassword: !!auth.mustChangePassword });
};
