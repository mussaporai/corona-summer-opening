const { verify, parseCookies, renew, cookieHeader, venueCookieHeader, SESSION_IDLE_MS } = require("../lib/session");
const { getTeam } = require("../lib/kv-team");
const { VENUES } = require("../lib/kv-state");
const { withErrorHandling } = require("../lib/with-error-handling");

module.exports = withErrorHandling(async function handler(req, res) {
  if (req.method === "POST") {
    const body = req.body || {};
    if (body.action === "set-venue") {
      const cookies = parseCookies(req.headers.cookie);
      const session = verify(cookies.corona_session);
      if (!session || !session.email) {
        res.status(401).json({ error: "sessão inválida" });
        return;
      }
      if (!VENUES.includes(body.venue)) {
        res.status(400).json({ error: "local inválido" });
        return;
      }
      res.setHeader("Set-Cookie", venueCookieHeader(body.venue, req));
      res.status(200).json({ ok: true, venue: body.venue });
      return;
    }
    // Sem action: comportamento original — logout.
    res.setHeader("Set-Cookie", cookieHeader("", 0, req));
    res.status(200).json({ ok: true });
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  const payload = verify(cookies.corona_session);
  if (!payload || !payload.email) {
    res.status(200).json({ email: null });
    return;
  }
  res.setHeader("Set-Cookie", cookieHeader(renew(payload), Math.floor(SESSION_IDLE_MS / 1000), req));
  const team = await getTeam();
  const cashflowAccess = (team.cashflowAccess || []).map(e => e.toLowerCase()).includes(payload.email.toLowerCase());
  res.status(200).json({ email: payload.email, mustChangePassword: !!payload.mustChangePassword, cashflowAccess });
});
