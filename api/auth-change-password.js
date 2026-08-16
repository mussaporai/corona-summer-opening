const { sign, verify, parseCookies } = require("../lib/session");
const { setUserPassword } = require("../lib/auth-store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "método não suportado" });
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }
  const newPassword = String((req.body && req.body.newPassword) || "");
  if (newPassword.length < 8) {
    res.status(400).json({ error: "a senha precisa ter pelo menos 8 caracteres" });
    return;
  }
  await setUserPassword(session.email, newPassword, false);

  const sessionToken = sign({ email: session.email, iat: Date.now(), mustChangePassword: false });
  const maxAge = 60 * 60 * 24 * 180;
  res.setHeader("Set-Cookie", `corona_session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
  res.status(200).json({ ok: true });
};
