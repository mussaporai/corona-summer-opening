const { verify, parseCookies } = require("../lib/session");
const { getTeam } = require("../lib/kv-team");
const { getFilesWithVersion, saveFilesIfUnchanged } = require("../lib/kv-files");
const { syncDriveFiles } = require("../lib/drive-sync");

const ADMIN_EMAIL = "marcelo.mussa@psdreamexperience.com.br";

// Duas formas de disparar: o cron da Vercel (autenticado pelo CRON_SECRET,
// que a própria Vercel manda automaticamente quando essa env var existe),
// ou uma pessoa admin/assistente master clicando em "sincronizar agora".
async function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || "";
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) return false;
  const email = session.email.toLowerCase();
  if (email === ADMIN_EMAIL) return true;
  const team = await getTeam();
  return (team.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "método não suportado" });
    return;
  }
  if (!(await isAuthorized(req))) {
    res.status(403).json({ error: "não autorizado" });
    return;
  }

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await getFilesWithVersion();
      const filesData = entry.value;
      const result = await syncDriveFiles(filesData);
      filesData.log.unshift({
        ts: Date.now(),
        who: "drive-sync",
        action: `sincronizou com o Drive da Dream: ${result.added} novo(s), ${result.updated} atualizado(s), ${result.missing} não encontrado(s) mais, ${result.restored} restaurado(s)`,
      });
      const ok = await saveFilesIfUnchanged(filesData, entry.version);
      if (ok) { res.status(200).json({ ok: true, ...result }); return; }
    }
    res.status(409).json({ error: "conflito de versão persistente, tente de novo" });
  } catch (err) {
    res.status(500).json({ error: err.message || "falha no sync do Drive" });
  }
};
