const APPROVED = require("../data/approved-emails.json");

const GITHUB_REPO = "mussaporai/corona-summer-opening";
const GITHUB_TOKEN = process.env.ACCESS_GITHUB_TOKEN;

function normalize(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const email = normalize(req.query.email);
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "email inválido" });
      return;
    }
    const approved = APPROVED.map(normalize).includes(email);
    res.status(200).json({ status: approved ? "approved" : "unknown" });
    return;
  }

  if (req.method === "POST") {
    const email = normalize(req.body && req.body.email);
    const name = String((req.body && req.body.name) || "").trim().slice(0, 200);
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "email inválido" });
      return;
    }

    if (APPROVED.map(normalize).includes(email)) {
      res.status(200).json({ status: "approved" });
      return;
    }

    if (!GITHUB_TOKEN) {
      res.status(200).json({ status: "pending", note: "solicitação recebida, notificação automática não configurada ainda" });
      return;
    }

    try {
      const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `Solicitação de acesso: ${email}`,
          body: `**E-mail:** ${email}\n**Nome informado:** ${name || "(não informado)"}\n**Quando:** ${new Date().toISOString()}\n\nPara aprovar, adicione o e-mail em \`data/approved-emails.json\` e feche esta issue.`,
          labels: ["acesso-pendente"],
        }),
      });
      if (!ghRes.ok) throw new Error(`GitHub API ${ghRes.status}`);
    } catch (err) {
      res.status(200).json({ status: "pending", note: "solicitação recebida, mas a notificação automática falhou — avise o Marcelo diretamente" });
      return;
    }

    res.status(200).json({ status: "pending" });
    return;
  }

  res.status(405).json({ error: "método não suportado" });
};
