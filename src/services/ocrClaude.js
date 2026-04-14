// Service for extracting essay text from an image using Claude Vision.
// Receives a raw buffer + mime type, returns the plain text body of the essay.
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic.default();

// Use the same model family as the essay evaluator (src/services/claude.js).
const MODEL = 'claude-sonnet-4-20250514';

const OCR_SYSTEM_PROMPT = `Você é um transcritor de redações manuscritas ou digitadas do ENEM.
Sua única função é ler a imagem e devolver o texto da redação, exatamente como foi escrito,
preservando a divisão em parágrafos com quebras de linha simples.

REGRAS ABSOLUTAS:
1. Retorne APENAS o corpo da redação. Nenhum comentário, nenhuma explicação, nenhum cabeçalho.
2. NÃO inclua o título da redação se ele estiver separado do corpo. Se houver título, ignore.
3. NÃO corrija erros ortográficos ou gramaticais do aluno — transcreva fielmente o que está escrito.
4. Separe parágrafos com uma única quebra de linha (\\n).
5. Se a imagem não contiver uma redação legível, retorne exatamente a string: __NO_ESSAY__
6. Nunca invente texto. Se uma palavra estiver ilegível, use [ilegível] no lugar.`;

class OcrError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'OcrError';
    this.code = code;
  }
}

async function extractEssayFromImage(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new OcrError('Empty image buffer', 'EMPTY_BUFFER');
  }

  const base64 = buffer.toString('base64');

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0,
      system: OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            {
              type: 'text',
              text: 'Transcreva o texto da redação nesta imagem seguindo as regras do sistema.',
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error('=== Claude Vision OCR Error ===');
    console.error('Message:', err.message);
    console.error('Status:', err.status);
    throw new OcrError('Claude Vision request failed', 'API_FAILURE');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new OcrError('No text block returned by Claude', 'NO_TEXT_BLOCK');
  }

  const text = textBlock.text.trim();
  if (text === '__NO_ESSAY__') {
    throw new OcrError('Image does not contain a legible essay', 'NO_ESSAY');
  }

  return text;
}

module.exports = { extractEssayFromImage, OcrError };
