const { verify, parseCookies, renew, cookieHeader, SESSION_IDLE_MS } = require("../lib/session");
const { getTeam } = require("../lib/kv-team");

module.exports = async function handler(req, res) {
  if (req.method === "POST") {
    res.setHeader("Set-Cookie", cookieHeader("", 0));
    res.status(200).json({ ok: true });
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  const payload = verify(cookies.corona_session);
  if (!payload || !payload.email) {
    res.status(200).json({ email: null });
    return;
  }
  res.setHeader("Set-Cookie", cookieHeader(renew(payload), Math.floor(SESSION_IDLE_MS / 1000)));
  const team = await getTeam();
  const cashflowAccess = (team.cashflowAccess || []).map(e => e.toLowerCase()).includes(payload.email.toLowerCase());
  res.status(200).json({ email: payload.email, mustChangePassword: !!payload.mustChangePassword, cashflowAccess });
};
