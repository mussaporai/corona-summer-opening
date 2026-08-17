const { verify, parseCookies } = require("../lib/session");
const { exchangeCodeForTokens } = require("../lib/google-calendar");
const { saveGoogleAuth } = require("../lib/kv-google");

const ADMIN_EMAIL = "marcelo.mussa@hotmail.com";

function redirect(res, query) {
  res.writeHead(302, { Location: `/calendario.html?google=${query}` });
  res.end();
}

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email || session.email.toLowerCase() !== ADMIN_EMAIL) {
    redirect(res, "erro");
    return;
  }
  const code = req.query.code;
  if (!code) {
    redirect(res, "erro");
    return;
  }
  try {
    const tokens = await exchangeCodeForTokens(String(code));
    if (!tokens.refresh_token) {
      redirect(res, "sem-refresh");
      return;
    }
    await saveGoogleAuth({
      connected: true,
      refreshToken: tokens.refresh_token,
      connectedBy: session.email,
      connectedAt: Date.now(),
    });
    redirect(res, "ok");
  } catch (err) {
    redirect(res, "erro");
  }
};
