const { verify, parseCookies, renew, cookieHeader, SESSION_IDLE_MS } = require("../lib/session");
const { getHours, saveHours } = require("../lib/kv-hours");
const { getTeam } = require("../lib/kv-team");

const ADMIN_EMAIL = "marcelo.mussa@psdreamexperience.com.br";
const MAX_DELTA_MS = 90 * 1000; // heartbeat é a cada 60s — nunca aceitar mais que isso por chamada

// Data no fuso de Brasília (UTC-3, sem horário de verão) — evita que o dia
// vire à meia-noite UTC do servidor em vez da meia-noite real daqui.
function brtDateStr(date) {
  const d = new Date(date.getTime() - 3 * 3600000);
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }
  res.setHeader("Set-Cookie", cookieHeader(renew(session), Math.floor(SESSION_IDLE_MS / 1000), req));
  const email = session.email.toLowerCase();

  if (req.method === "GET") {
    if (email !== ADMIN_EMAIL) {
      res.status(403).json({ error: "apenas o administrador master pode ver isso" });
      return;
    }
    const [hours, team] = await Promise.all([getHours(), getTeam()]);
    const rows = Object.keys(hours.users).map(e => {
      const member = team.members.find(m => (m.email || "").toLowerCase() === e);
      const days = hours.users[e].days || {};
      return {
        email: e,
        name: (member && member.name) || e,
        totalMs: hours.users[e].totalMs || 0,
        lastActivity: hours.users[e].lastActivity || null,
        days: Object.keys(days).sort().reverse().map(d => ({ date: d, ms: days[d] }))
      };
    }).sort((a, b) => b.totalMs - a.totalMs);
    res.status(200).json({ rows, today: brtDateStr(new Date()) });
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    let deltaMs = Number(body.deltaMs) || 0;
    if (deltaMs <= 0) { res.status(200).json({ ok: true }); return; }
    if (deltaMs > MAX_DELTA_MS) deltaMs = MAX_DELTA_MS;
    const hours = await getHours();
    if (!hours.users[email]) hours.users[email] = { totalMs: 0, lastActivity: null, days: {} };
    if (!hours.users[email].days) hours.users[email].days = {};
    const dateStr = brtDateStr(new Date());
    hours.users[email].days[dateStr] = (hours.users[email].days[dateStr] || 0) + deltaMs;
    hours.users[email].totalMs += deltaMs;
    hours.users[email].lastActivity = Date.now();
    await saveHours(hours);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "método não suportado" });
};
