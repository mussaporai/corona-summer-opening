const crypto = require("crypto");

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function sign(payload) {
  const secret = process.env.SESSION_SECRET;
  const data = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}

const SESSION_IDLE_MS = 8 * 60 * 60 * 1000; // sem nenhuma requisição por 8h, a sessão expira

function cookieHeader(token, maxAgeSec, req) {
  // "Secure" exige HTTPS — em "vercel dev" local (sempre http://localhost,
  // sem proxy na frente) o navegador descarta o cookie silenciosamente,
  // deixando a pessoa presa na tela de login mesmo com a senha certa.
  // O proxy da Vercel sempre manda x-forwarded-proto:https em produção/
  // preview; local nunca manda, então isso identifica o ambiente com
  // segurança (não depende de VERCEL_ENV, que pode vir sobrescrito por
  // um .env.local puxado de outro ambiente).
  const isHttps = !req || req.headers["x-forwarded-proto"] === "https";
  const secure = isHttps ? "Secure; " : "";
  return `corona_session=${token}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}

function renew(payload) {
  const { exp, ...rest } = payload;
  return sign({ ...rest, exp: Date.now() + SESSION_IDLE_MS });
}

function verify(token) {
  const secret = process.env.SESSION_SECRET;
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const expected = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(data).toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach(p => {
    const idx = p.indexOf("=");
    if (idx === -1) return;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

module.exports = { sign, verify, parseCookies, renew, cookieHeader, SESSION_IDLE_MS };
