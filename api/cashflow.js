const { verify, parseCookies } = require("../lib/session");
const CASHFLOW_ACCESS = require("../data/cashflow-access.json");
const CONTENT = require("../data/cashflow-content.json");

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = verify(cookies.corona_session);
  if (!payload || !payload.email) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  const allowed = CASHFLOW_ACCESS.map(e => e.toLowerCase()).includes(payload.email.toLowerCase());
  if (!allowed) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.status(200).json(CONTENT);
};
