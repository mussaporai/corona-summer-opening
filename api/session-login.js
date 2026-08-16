const { sign, verify } = require("./lib/session");

module.exports = async function handler(req, res) {
  const token = req.query.token;
  const payload = verify(token);
  if (!payload || !payload.email) {
    res.status(401).send("Link inválido ou expirado. Peça um novo link a quem administra o acesso.");
    return;
  }
  const sessionToken = sign({ email: payload.email, iat: Date.now() });
  const maxAge = 60 * 60 * 24 * 180; // 180 dias
  res.setHeader(
    "Set-Cookie",
    `corona_session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
  res.writeHead(302, { Location: "/index.html" });
  res.end();
};
