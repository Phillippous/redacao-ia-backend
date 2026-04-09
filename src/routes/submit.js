// Route for receiving essay submissions and triggering AI correction
const express = require('express');
const router = express.Router();
const { evaluateEssay } = require('../services/claude');
const { saveSubmission } = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const submissionLimiter = require('../middleware/rateLimit');

const MAX_REDACAO_LENGTH = 10_000;

// Removes null bytes and ASCII control characters (keeps \n, \r, \t)
function sanitizeText(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFEFF]/g, '');
}

router.post('/', requireAuth, submissionLimiter, async (req, res) => {
  const { tema, redacao } = req.body;

  if (!tema || !redacao) {
    return res.status(400).json({ error: 'Os campos "tema" e "redacao" são obrigatórios.' });
  }

  const temaLimpo = sanitizeText(String(tema)).trim();
  const redacaoLimpa = sanitizeText(String(redacao)).trim();

  if (redacaoLimpa.length < 50) {
    return res.status(400).json({ error: 'A redação deve ter pelo menos 50 caracteres.' });
  }

  if (redacaoLimpa.length > MAX_REDACAO_LENGTH) {
    return res.status(400).json({
      error: `A redação deve ter no máximo ${MAX_REDACAO_LENGTH.toLocaleString('pt-BR')} caracteres.`,
    });
  }

  let resultado;
  try {
    resultado = await evaluateEssay(temaLimpo, redacaoLimpa);
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
      tema: temaLimpo,
      redacao: redacaoLimpa,
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
