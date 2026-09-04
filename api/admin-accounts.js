const crypto = require("crypto");
const { verify, parseCookies } = require("../lib/session");
const { getAuthStore, setUserPassword } = require("../lib/auth-store");
const { getTeam, saveTeam } = require("../lib/kv-team");
const { getApprovedEmails, saveApprovedEmails } = require("../lib/kv-emails");
const { withErrorHandling } = require("../lib/with-error-handling");

const ADMIN_EMAIL = "marcelo.mussa@psdreamexperience.com.br";

// Senha temporária aleatória por conta/reset — não pode ser um valor fixo no
// código, senão qualquer e-mail aprovado vira uma conta previsível de logar.
function randomTempPassword() {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

module.exports = withErrorHandling(async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email || session.email.toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: "apenas o administrador master pode acessar" });
    return;
  }

  if (req.method === "GET") {
    const [APPROVED, store] = await Promise.all([getApprovedEmails(), getAuthStore()]);
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
    const body = req.body || {};

    if (body.action === "add-email") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) { res.status(400).json({ error: "e-mail inválido" }); return; }
      const list = await getApprovedEmails();
      if (!list.map(e => e.toLowerCase()).includes(email)) {
        list.push(email);
        await saveApprovedEmails(list);
      }
      const tempPassword = randomTempPassword();
      await setUserPassword(email, tempPassword, true);
      // Toda pessoa aprovada já entra com acesso liberado — evita bloqueios
      // de "acesso restrito" (relatório/cronograma) pra quem acabou de ser cadastrado.
      const team = await getTeam();
      const cfSet = new Set((team.cashflowAccess || []).map(e => e.toLowerCase()));
      if (!cfSet.has(email)) {
        cfSet.add(email);
        team.cashflowAccess = Array.from(cfSet);
        await saveTeam(team);
      }
      res.status(200).json({ ok: true, approvedEmails: list, tempPassword });
      return;
    }

    if (body.action === "remove-email") {
      const email = String(body.email || "").trim().toLowerCase();
      if (email === ADMIN_EMAIL) { res.status(400).json({ error: "não é possível remover o administrador master" }); return; }
      const list = (await getApprovedEmails()).filter(e => e.toLowerCase() !== email);
      await saveApprovedEmails(list);
      res.status(200).json({ ok: true, approvedEmails: list });
      return;
    }

    const email = String(body.email || "").trim().toLowerCase();
    const APPROVED = await getApprovedEmails();
    if (!APPROVED.map(e => e.toLowerCase()).includes(email)) {
      res.status(400).json({ error: "e-mail não está na lista de aprovados" });
      return;
    }
    const tempPassword = randomTempPassword();
    await setUserPassword(email, tempPassword, true);
    res.status(200).json({ ok: true, email, tempPassword });
    return;
  }

  res.status(405).json({ error: "método não suportado" });
});
