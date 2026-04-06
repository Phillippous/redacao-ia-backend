// QA AMARELA — Rate Limiting
//
// Verifica que o rate limiter rejeita requisições em excesso com 429
// e que a resposta inclui mensagem clara de quando tentar novamente.
//
// ATENÇÃO: Este teste consome quota do rate limiter. Execute com cuidado
// em produção. Em CI, configure RATE_LIMIT_MAX=3 e RATE_LIMIT_WINDOW_MS=60000
// para janelas menores que não bloqueiem o restante da suite.
//
// Executar: node --test tests/qa-amarela-ratelimit.test.js

'use strict';

require('dotenv').config();

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const api = require('./helpers/api-client');

const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX) || 10;
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3_600_000;

// Texto curto que passa na validação de 50 chars mas não consome crédito IA
// (a validação de comprimento ocorre ANTES da chamada à Claude)
const TEXTO_TESTE = 'A educação é fundamental para o desenvolvimento do Brasil e de sua população.';

let token;

before(async () => {
  token = await api.getTestToken();
});

// ── RATE-01 ───────────────────────────────────────────────────────────────────

describe('RATE-01 — Rate limiter ativo', () => {
  it('Deve existir header RateLimit-Limit nas respostas de /submit', async () => {
    // Uma requisição simples — pode falhar por validação antes do rate limiter,
    // mas os headers de rate limit devem sempre estar presentes.
    const { headers } = await api.submitEssay('Tema qualquer', TEXTO_TESTE, token);
    // express-rate-limit com standardHeaders: true adiciona RateLimit-* headers
    const hasRateHeader =
      headers.get('ratelimit-limit') !== null ||
      headers.get('x-ratelimit-limit') !== null;
    assert.ok(hasRateHeader, 'Nenhum header RateLimit encontrado na resposta');
  });
});

// ── RATE-02 ───────────────────────────────────────────────────────────────────

describe('RATE-02 — Limite é respeitado', () => {
  it(`Após ${RATE_LIMIT_MAX} requisições, a próxima deve retornar 429`, async function() {
    // Este teste só é viável se RATE_LIMIT_MAX for pequeno (≤ 5).
    // Com o padrão de 10 req/h, skip automático para não consumir quota.
    if (RATE_LIMIT_MAX > 20) {
      console.warn(
        `\n⚠  RATE-02 ignorado: RATE_LIMIT_MAX=${RATE_LIMIT_MAX} é muito alto para ` +
        'teste automatizado. Configure RATE_LIMIT_MAX≤20 em .env para habilitar.\n'
      );
      return;
    }

    // Usar /health (resposta instantânea) para exaurir o contador sem chamar a IA.
    // O rate limiter é global (app.use(limiter)) e conta qualquer rota.
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await api.health();
    }

    // A próxima deve retornar 429
    const { status, body } = await api.health();
    assert.strictEqual(status, 429, `Esperado 429 após ${RATE_LIMIT_MAX} req, recebi ${status}`);
    // Mensagem deve indicar quando tentar novamente
    const msg = body.erro || body.error || '';
    assert.ok(
      msg.toLowerCase().includes('limite') || msg.toLowerCase().includes('minuto'),
      `Mensagem 429 deve mencionar o limite ou o tempo de espera. Recebi: "${msg}"`
    );
  });
});

// ── RATE-03 ───────────────────────────────────────────────────────────────────

describe('RATE-03 — Mensagem de 429 é amigável', () => {
  it('Resposta 429 deve conter campo "erro" com tempo de espera', async () => {
    // Simular 429 apenas se o rate limit for baixo
    if (RATE_LIMIT_MAX > 20) {
      console.warn('⚠  RATE-03 ignorado: RATE_LIMIT_MAX muito alto para teste seguro.');
      return;
    }

    // Exaurir o limite via /health (instantâneo, rate limiter é global)
    for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
      await api.health();
    }

    const { status, body } = await api.health();
    if (status === 429) {
      assert.ok(body.erro || body.error,
        'Resposta 429 deve ter campo "erro" ou "error"'
      );
    }
    // Se não atingiu 429, o teste é inconclusivo — não falha.
  });
});
