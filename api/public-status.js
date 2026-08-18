const { getState } = require("../lib/kv-state");

// Link público de acompanhamento pro cliente — sem login, só leitura, sem
// interação. Protegido só pelo token (link "secreto"), já que não há tela
// de acesso. Não expõe valores em R$, fornecedores, notas internas nem as
// frentes 6 (Dream Team) e 7 (Back Office & Extras) — só o progresso real
// de entrega do projeto.
const PUBLIC_TOKEN = "NyYFmJ3Zs0UuTH_-vOhPKhw7NdpVdNrv";
const CLIENT_VISIBLE_CATEGORIES = [1, 2, 3, 4, 5];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "método não suportado" });
    return;
  }
  const token = req.query && req.query.t;
  if (token !== PUBLIC_TOKEN) {
    res.status(403).json({ error: "acesso negado" });
    return;
  }

  const state = await getState();
  const today = todayStr();

  const categories = state.categories
    .filter(c => CLIENT_VISIBLE_CATEGORIES.includes(c.num))
    .map(c => {
      const items = (c.items || [])
        .filter(it => it.name && it.name !== "Novo item — clique para editar")
        .map(it => {
          const subTotal = (it.radar || []).length;
          const subDone = (it.radar || []).filter(r => r.done).length;
          const overdue = !!(it.deadline && it.deadline < today && !it.completed);
          return {
            code: it.code,
            name: it.name,
            started: !!it.started,
            completed: !!it.completed,
            overdue,
            deadline: it.deadline || null,
            subTotal,
            subDone
          };
        });
      const total = items.length;
      const done = items.filter(i => i.completed).length;
      return {
        num: c.num,
        name: c.name,
        pct: total ? Math.round((done / total) * 100) : 0,
        items
      };
    });

  const totalAll = categories.reduce((s, c) => s + c.items.length, 0);
  const doneAll = categories.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    generatedAt: Date.now(),
    overallPct: totalAll ? Math.round((doneAll / totalAll) * 100) : 0,
    categories
  });
};
