const { verify, parseCookies } = require("./lib/session");

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = verify(cookies.corona_session);
  if (!payload || !payload.email) {
    res.status(200).json({ email: null });
    return;
  }
  res.status(200).json({ email: payload.email });
};
