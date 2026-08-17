const { sign, cookieHeader, SESSION_IDLE_MS } = require("../lib/session");
const { getUserAuth, verifyPassword, touchLastLogin } = require("../lib/auth-store");
const { getApprovedEmails } = require("../lib/kv-emails");
const { kvGet, kvSet } = require("../lib/db");

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function loginAttemptsKey(email) {
  return `corona:login-attempts:${email}`;
}

async function getLoginAttempts(email) {
  const data = await kvGet(loginAttemptsKey(email));
  return data || { count: 0, lockedUntil: 0 };
}

async function registerLoginFailure(email) {
  const attempts = await getLoginAttempts(email);
  const count = attempts.count + 1;
  const lockedUntil = count >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOGIN_LOCKOUT_MS : 0;
  await kvSet(loginAttemptsKey(email), { count, lockedUntil });
}

async function clearLoginAttempts(email) {
  await kvSet(loginAttemptsKey(email), { count: 0, lockedUntil: 0 });
}

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
  const attempts = await getLoginAttempts(email);
  if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
    res.status(429).json({ error: "muitas tentativas de login, tente novamente em alguns minutos" });
    return;
  }
  const APPROVED = await getApprovedEmails();
  if (!APPROVED.map(e => e.toLowerCase()).includes(email)) {
    await registerLoginFailure(email);
    res.status(401).json({ error: "e-mail ou senha inválidos" });
    return;
  }
  const auth = await getUserAuth(email);
  if (!auth || !verifyPassword(password, auth.passwordHash)) {
    await registerLoginFailure(email);
    res.status(401).json({ error: "e-mail ou senha inválidos" });
    return;
  }

  const sessionToken = sign({ email, iat: Date.now(), mustChangePassword: !!auth.mustChangePassword, exp: Date.now() + SESSION_IDLE_MS });
  res.setHeader("Set-Cookie", cookieHeader(sessionToken, Math.floor(SESSION_IDLE_MS / 1000), req));
  await touchLastLogin(email);
  await clearLoginAttempts(email);
  res.status(200).json({ ok: true, mustChangePassword: !!auth.mustChangePassword });
};
