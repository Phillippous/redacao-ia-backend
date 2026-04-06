// Route for receiving essay submissions and triggering AI correction
const express = require('express');
const router = express.Router();
const { evaluateEssay } = require('../services/claude');
const { saveSubmission } = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.post('/', requireAuth, async (req, res) => {
  const { tema, redacao } = req.body;

  if (!tema || !redacao) {
    return res.status(400).json({ error: 'Os campos "tema" e "redacao" são obrigatórios.' });
  }

  if (typeof redacao !== 'string' || redacao.trim().length < 50) {
    return res.status(400).json({ error: 'A redação deve ter pelo menos 50 caracteres.' });
  }

  let resultado;
  try {
    resultado = await evaluateEssay(tema.trim(), redacao.trim());
  } catch (err) {
    console.error('Erro ao chamar Claude:', err);
    return res.status(502).json({ error: 'Falha ao processar a redação com IA.' });
  }

  const { c1, c2, c3, c4, c5 } = resultado.competencias;
  const nota_total = c1.nota + c2.nota + c3.nota + c4.nota + c5.nota;

  let saved;
  try {
    saved = await saveSubmission({
      user_id: req.user.id,
      tema: tema.trim(),
      redacao: redacao.trim(),
      resultado,
      nota_total,
    });
  } catch (err) {
    console.error('Erro ao salvar no Supabase:', err);
    return res.status(500).json({ error: 'Erro ao salvar a redação. Tente novamente.' });
  }

  return res.json({
    nota_total,
    competencias: resultado.competencias,
    resumo_geral: resultado.resumo_geral,
    submission_id: saved.id,
  });
});

module.exports = router;
