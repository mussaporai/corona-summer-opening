// Sem isso, um erro não tratado (ex: Supabase fora do ar por um instante)
// derruba a função sem corpo de resposta — o cliente recebe um 500 cru da
// Vercel em vez de um JSON que mutate()/fetchState() sabem mostrar. Envolve
// o handler inteiro; se a resposta já foi iniciada antes do erro, não tenta
// mandar uma segunda.
function withErrorHandling(handler) {
  return async function wrapped(req, res) {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ error: "erro interno, tente novamente em instantes" });
      }
    }
  };
}

module.exports = { withErrorHandling };
