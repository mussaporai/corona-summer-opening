const { verify, parseCookies } = require("../lib/session");
const { getPresignedPutUrl, getPresignedGetUrl, deleteObject } = require("../lib/r2");
const { getTeam } = require("../lib/kv-team");
const { getFiles } = require("../lib/kv-files");
const { withErrorHandling } = require("../lib/with-error-handling");

const ADMIN_EMAIL = "marcelo.mussa@psdreamexperience.com.br";
const ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"];
const CONTENT_TYPES = {
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

function safeKey(folder, filename) {
  const ext = (String(filename).match(/\.[a-zA-Z0-9]+$/) || [""])[0].toLowerCase();
  const base = String(filename).replace(/\.[a-zA-Z0-9]+$/, "").replace(/[^a-zA-Z0-9-_ ]/g, "").trim().slice(0, 80) || "arquivo";
  const cleanFolder = String(folder || "misc").replace(/[^a-zA-Z0-9-_/]/g, "").replace(/\.\./g, "").replace(/^\/+/, "");
  return { key: `${cleanFolder}/${Date.now()}-${base.replace(/\s+/g, "-")}${ext}`, ext };
}

module.exports = withErrorHandling(async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }

  if (req.method === "POST") {
    const { filename, folder } = req.body || {};
    if (!filename) { res.status(400).json({ error: "nome de arquivo obrigatório" }); return; }
    const { key, ext } = safeKey(folder, filename);
    if (!ALLOWED_EXT.includes(ext)) {
      res.status(400).json({ error: "formato não permitido — use PDF, JPG, PNG, DOC, XLS ou PPT" });
      return;
    }
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    try {
      const uploadUrl = await getPresignedPutUrl(key, contentType);
      res.status(200).json({ uploadUrl, key, contentType });
    } catch (err) {
      res.status(500).json({ error: err.message || "falha ao gerar link de upload" });
    }
    return;
  }

  if (req.method === "GET") {
    const key = String(req.query.key || "");
    if (!key) { res.status(400).json({ error: "key obrigatória" }); return; }
    const email = session.email.toLowerCase();
    if (email !== ADMIN_EMAIL) {
      const [team, filesData] = await Promise.all([getTeam(), getFiles()]);
      const isMasterAssistant = (team.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
      if (!isMasterAssistant) {
        const f = (filesData.files || []).find(x => x.link === `r2:${key}`);
        if (f && f.restrictedTo && f.restrictedTo.length && !f.restrictedTo.map(e => e.toLowerCase()).includes(email)) {
          res.status(403).json({ error: "acesso restrito a este arquivo" });
          return;
        }
      }
    }
    try {
      const downloadUrl = await getPresignedGetUrl(key);
      res.status(200).json({ downloadUrl });
    } catch (err) {
      res.status(500).json({ error: err.message || "falha ao gerar link de download" });
    }
    return;
  }

  if (req.method === "DELETE") {
    const key = String((req.body && req.body.key) || req.query.key || "");
    if (!key) { res.status(400).json({ error: "key obrigatória" }); return; }
    const email = session.email.toLowerCase();
    if (email !== ADMIN_EMAIL) {
      const team = await getTeam();
      const allowed = (team.masterAssistants || []).map(e => e.toLowerCase()).includes(email);
      if (!allowed) {
        res.status(403).json({ error: "só o produtor master e o assistente de produção master podem apagar arquivos" });
        return;
      }
    }
    try {
      await deleteObject(key);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message || "falha ao remover arquivo" });
    }
    return;
  }

  res.status(405).json({ error: "método não suportado" });
});
