const { sign } = require("./lib/session");
const APPROVED = require("../data/approved-emails.json");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "método não suportado" });
    return;
  }
  const adminSecret = req.headers["x-admin-secret"];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: "não autorizado" });
    return;
  }
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "email inválido" });
    return;
  }
  if (!APPROVED.map(e => e.toLowerCase()).includes(email)) {
    res.status(400).json({ error: "esse e-mail não está na lista de aprovados" });
    return;
  }
  const token = sign({ email, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 365 });
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = `${proto}://${req.headers.host}/api/session-login?token=${token}`;
  res.status(200).json({ url, email });
};
