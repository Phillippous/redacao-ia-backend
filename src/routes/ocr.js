// Route for extracting essay text from an uploaded image via Claude Vision.
// The frontend uploads an image and receives plain text it can put in the
// essay textarea. OCR + evaluation are intentionally split into two calls:
// the user gets a chance to review/edit the transcription before submitting.
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const submissionLimiter = require('../middleware/rateLimit');
const { handleImageUpload } = require('../middleware/imageUpload');
const { extractEssayFromImage } = require('../services/ocrClaude');
const { sanitizeText } = require('../utils/sanitize');

const MIN_REDACAO_LENGTH = 50;
const GENERIC_ERROR = 'Há um erro na imagem anexada';

router.post('/', requireAuth, submissionLimiter, handleImageUpload, async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: GENERIC_ERROR });
  }

  let rawText;
  try {
    rawText = await extractEssayFromImage(req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error('OCR failed:', err.code || err.message);
    return res.status(502).json({ error: GENERIC_ERROR });
  }

  const redacao = sanitizeText(String(rawText || '')).trim();

  if (redacao.length < MIN_REDACAO_LENGTH) {
    return res.status(400).json({ error: GENERIC_ERROR });
  }

  return res.json({ redacao });
});

module.exports = router;
