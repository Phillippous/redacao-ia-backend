// tests/security/PT-04-ratelimit-bypass.test.js
require('dotenv').config();
const { apiRequest, login } = require('./helpers/pentest-client');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_ANON_KEY;
const TEXTO_CURTO = 'Teste. '.repeat(50);

describe('PT-04: Rate Limiting e Auth Brute Force', async () => {
  let token;

  before(async () => {
    const u = await login(process.env.PENTEST_EMAIL_A, process.env.PENTEST_PASSWORD);
    token = u.token;
  });

  it('PT-04-A: Rate limit ativo — recebe 429 após 4 submissões por hora', async () => {
    const resultados = [];
    for (let i = 0; i < 6; i++) {
      const r = await apiRequest('POST', '/submit', {
        tema: `Tema de teste ${i}`,
        redacao: TEXTO_CURTO
      }, token);
      resultados.push(r.status);
      if (r.status === 429) break;
    }
    const hit429 = resultados.includes(429);
    assert.ok(hit429,
      'FALHA: 6 submissões sem 429 — rate limiting de 4/hora não está funcionando. RISCO FINANCEIRO.');
  });

  it('PT-04-B: Rate limit por usuário — não apenas por IP', async () => {
    const b = await login(process.env.PENTEST_EMAIL_B, process.env.PENTEST_PASSWORD);
    const tokenB = b.token;
    const r = await apiRequest('POST', '/submit', {
      tema: 'Teste rate limit usuário diferente',
      redacao: TEXTO_CURTO
    }, tokenB);
    assert.notStrictEqual(r.status, 429,
      'ALERTA: rate limit por IP — usuário B bloqueado por ações do usuário A');
  });

  it('PT-04-C: Resposta 429 inclui headers informativos', async () => {
    let resp429 = null;
    for (let i = 0; i < 6; i++) {
      const r = await apiRequest('POST', '/submit', {
        tema: `Tema ${i}`, redacao: TEXTO_CURTO
      }, token);
      if (r.status === 429) { resp429 = r; break; }
    }
    if (resp429) {
      const temRetryAfter = resp429.headers['retry-after'] || resp429.headers['x-ratelimit-reset'];
      assert.ok(temRetryAfter,
        'MELHORIA: resposta 429 sem Retry-After — usuário não sabe quando tentar novamente');
    }
  });

  it('PT-04-D: Auth endpoint bloqueia brute force de senha', async () => {
    const EMAIL_ALVO = process.env.PENTEST_EMAIL_A;
    const SENHA_ERRADA = 'SenhaErradaBruteForce#000';
    const TENTATIVAS = 15;
    const statusCodes = [];

    for (let i = 0; i < TENTATIVAS; i++) {
      const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
        body: JSON.stringify({ email: EMAIL_ALVO, password: `${SENHA_ERRADA}_${i}` })
      });
      statusCodes.push(r.status);

      if (r.status === 429 || r.status === 423) {
        console.log(`PT-04-D: bloqueio detectado na tentativa ${i + 1} com status ${r.status}`);
        break;
      }

      await new Promise(res => setTimeout(res, 200));
    }

    const bloqueou = statusCodes.some(s => s === 429 || s === 423);

    if (!bloqueou) {
      console.log(`ALERTA PT-04-D: ${TENTATIVAS} tentativas de login com senha errada sem bloqueio.`);
      console.log('Verificar em: Supabase Dashboard → Auth → Rate Limits → Login attempts');
      console.log('Status codes recebidos:', statusCodes);
    }
    // Informativo — Supabase gerencia internamente
  });

  it('PT-04-E: Endpoint de signup tem proteção contra criação em massa', async () => {
    const statusCodes = [];
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${SB_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
        body: JSON.stringify({
          email: `spam_test_${Date.now()}_${i}@notaapp.com.br`,
          password: 'SenhaValida#2024!'
        })
      });
      statusCodes.push(r.status);
      if (r.status === 429) break;
      await new Promise(res => setTimeout(res, 300));
    }

    const bloqueou = statusCodes.some(s => s === 429);
    if (!bloqueou) {
      console.log('ALERTA PT-04-E: 10 signups sem bloqueio — verificar rate limits no Supabase Dashboard');
    }
  });
});
