const { verify, parseCookies } = require("../lib/session");
const { getTeam, saveTeam } = require("../lib/kv-team");

const ADMIN_EMAIL = "marcelo.mussa@hotmail.com";

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.corona_session);
  if (!session || !session.email) {
    res.status(401).json({ error: "sessão inválida" });
    return;
  }
  const isAdmin = session.email.toLowerCase() === ADMIN_EMAIL;

  if (req.method === "GET") {
    const team = await getTeam();
    res.status(200).json({ members: team.members, categoryOwners: team.categoryOwners, isAdmin, email: session.email });
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const team = await getTeam();

    if (body.action === "set-owner") {
      if (!isAdmin) { res.status(403).json({ error: "apenas o administrador pode definir responsáveis" }); return; }
      const catNum = String(body.catNum || "");
      if (!catNum) { res.status(400).json({ error: "frente inválida" }); return; }
      team.categoryOwners[catNum] = (body.email || "").trim().toLowerCase();
      await saveTeam(team);
      res.status(200).json({ ok: true, categoryOwners: team.categoryOwners });
      return;
    }

    const targetEmail = (body.email || session.email).trim().toLowerCase();
    if (targetEmail !== session.email.toLowerCase() && !isAdmin) {
      res.status(403).json({ error: "só é possível editar seu próprio perfil" });
      return;
    }
    let member = team.members.find(m => m.email.toLowerCase() === targetEmail);
    if (!member) { member = { email: targetEmail }; team.members.push(member); }
    if (typeof body.name === "string") member.name = body.name.trim().slice(0, 100);
    if (typeof body.position === "string") member.position = body.position.trim().slice(0, 100);
    if (typeof body.phone === "string") member.phone = body.phone.trim().slice(0, 40);
    if (typeof body.photo === "string" && body.photo.length < 300000) member.photo = body.photo;
    await saveTeam(team);
    res.status(200).json({ ok: true, member });
    return;
  }

  res.status(405).json({ error: "método não suportado" });
};
