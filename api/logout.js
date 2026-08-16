module.exports = async function handler(req, res) {
  res.setHeader("Set-Cookie", "corona_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  res.status(200).json({ ok: true });
};
