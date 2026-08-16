const { cookieHeader } = require("../lib/session");

module.exports = async function handler(req, res) {
  res.setHeader("Set-Cookie", cookieHeader("", 0));
  res.status(200).json({ ok: true });
};
