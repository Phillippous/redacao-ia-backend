// tests/security/PT-07-info-disclosure.test.js
require('dotenv').config();
const { apiRequest, login } = require('./helpers/pentest-client');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

describe('PT-07: Divulgação de Informações', async () => {
  let token;

  before(async () => {
    const u = await login(process.env.PENTEST_EMAIL_A, process.env.PENTEST_PASSWORD);
    token = u.token;
  });

  const STRINGS_SENSIVEIS = [
    'ANTHROPIC_API_KEY',
    'sk-ant-',
    'supabase_service_role',
    'service_role',
    'postgres://',
    'DATABASE_URL',
    'at Object.<anonymous>',
    'node_modules',
    'Error: Cannot find module',
  ];

  it('PT-07-A: Rota 404 não expõe stack trace', async () => {
    const r = await apiRequest('GET', '/rota-que-nao-existe-xyzabc', null, token);
    const body = JSON.stringify(r.data || '');
    for (const s of STRINGS_SENSIVEIS) {
      assert.ok(!body.includes(s),
        `FALHA: "${s}" encontrado na resposta 404`);
    }
  });

  it('PT-07-B: Erros 500 não expõem variáveis de ambiente', async () => {
    const r = await apiRequest('POST', '/submit', { tema: null, texto: undefined }, token);
    const body = JSON.stringify(r.data || '');
    for (const s of STRINGS_SENSIVEIS) {
      assert.ok(!body.includes(s),
        `FALHA: "${s}" exposto em resposta de erro`);
    }
  });

  it('PT-07-C: Headers não revelam versão do servidor', async () => {
    const r = await fetch(`${process.env.API_URL || 'http://localhost:3001'}/submissions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const server = r.headers.get('x-powered-by') || '';
    assert.ok(!server.includes('Express'),
      `MELHORIA: header X-Powered-By expõe framework: "${server}"`);
  });

  it('PT-07-D: Erro de login não diferencia "email não existe" de "senha errada"', async () => {
    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_ANON_KEY;
    const r1 = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      body: JSON.stringify({ email: 'inexistente_xyz@notaapp.com.br', password: 'qualquer' })
    });
    const r2 = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      body: JSON.stringify({ email: process.env.PENTEST_EMAIL_A, password: 'errada' })
    });
    const d1 = await r1.json();
    const d2 = await r2.json();
    console.log('PT-07-D — Email inexistente:', d1.error_description || d1.msg);
    console.log('PT-07-D — Senha errada:', d2.error_description || d2.msg);
    // Informativo — depende do Supabase
  });

  it('PT-07-E: Bundle Next.js não contém secrets ou credenciais', async () => {
    const homeRes = await fetch(`${FRONTEND}/`).catch(() => null);
    if (!homeRes) {
      console.log('PT-07-E: frontend não acessível — pular');
      return;
    }
    const homeHtml = await homeRes.text();

    const chunkMatches = homeHtml.match(/\/_next\/static\/chunks\/[^"']+\.js/g) || [];
    const uniqueChunks = [...new Set(chunkMatches)].slice(0, 10);

    const SECRETS_NO_BUNDLE = [
      'sk-ant-',
      'ANTHROPIC_API_KEY',
      'service_role',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIi',
      'postgres://',
      'DATABASE_URL',
    ];

    for (const secret of SECRETS_NO_BUNDLE) {
      assert.ok(!homeHtml.includes(secret),
        `FALHA CRÍTICA: "${secret}" encontrado no HTML da home — exposto no browser`);
    }

    for (const chunk of uniqueChunks) {
      const chunkRes = await fetch(`${FRONTEND}${chunk}`).catch(() => null);
      if (!chunkRes) continue;
      const chunkContent = await chunkRes.text();

      for (const secret of SECRETS_NO_BUNDLE) {
        assert.ok(!chunkContent.includes(secret),
          `FALHA CRÍTICA: "${secret}" encontrado no chunk ${chunk} — exposto no browser`);
      }
    }

    console.log(`PT-07-E: ${uniqueChunks.length} chunks JS verificados`);
  });

  it('PT-07-F: Página de erro Next.js não expõe stack trace em produção', async () => {
    const r = await fetch(`${FRONTEND}/resultado/id-invalido-xyz`).catch(() => null);
    if (!r) return;

    const body = await r.text();

    const padroesDev = [
      'webpack-internal://',
      'at getServerSideProps',
      'node_modules/.pnpm',
      'SyntaxError:',
      'TypeError:',
      'Cannot read properties of',
    ];

    for (const padrao of padroesDev) {
      assert.ok(!body.includes(padrao),
        `ALERTA: padrão de erro de dev "${padrao}" exposto no browser — confirmar NODE_ENV=production`);
    }
  });
});
