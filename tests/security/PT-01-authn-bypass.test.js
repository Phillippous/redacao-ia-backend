// tests/security/PT-01-authn-bypass.test.js
require('dotenv').config();
const { apiRequest, login } = require('./helpers/pentest-client');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

describe('PT-01: Autenticação, Bypass e Enumeração de Rotas', async () => {
  let token, submissionIdValido;

  before(async () => {
    const u = await login(process.env.PENTEST_EMAIL_A, process.env.PENTEST_PASSWORD);
    token = u.token;
    const sub = await apiRequest('POST', '/submit', {
      tema: 'Tema setup PT-01',
      redacao: 'Texto de setup para testes de verbo HTTP. '.repeat(20)
    }, token);
    submissionIdValido = sub.data?.submission_id || sub.data?.id;
  });

  it('PT-01-A: GET /submissions sem token deve retornar 401', async () => {
    const r = await apiRequest('GET', '/submissions', null, null);
    assert.strictEqual(r.status, 401, `FALHA: retornou ${r.status} sem autenticação`);
  });

  it('PT-01-B: POST /submit sem token deve retornar 401', async () => {
    const r = await apiRequest('POST', '/submit', { tema: 'Teste', texto: 'Texto qualquer' }, null);
    assert.strictEqual(r.status, 401, `FALHA: endpoint de submissão acessível sem token`);
  });

  it('PT-01-C: Token inválido deve retornar 401', async () => {
    const r = await apiRequest('GET', '/submissions', null, 'token_invalido_qualquer');
    assert.strictEqual(r.status, 401, `FALHA: token inválido aceito`);
  });

  it('PT-01-D: JWT com algoritmo "none" deve ser rejeitado', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'fake-user-id', role: 'authenticated' })).toString('base64url');
    const fakeJWT = `${header}.${payload}.`;
    const r = await apiRequest('GET', '/submissions', null, fakeJWT);
    assert.strictEqual(r.status, 401, `FALHA: JWT com alg:none aceito — VULNERABILIDADE CRÍTICA`);
  });

  it('PT-01-E: Token expirado deve retornar 401', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: 'qualquer-id',
      exp: Math.floor(Date.now() / 1000) - 3600,
      role: 'authenticated'
    })).toString('base64url');
    const expiredToken = `${header}.${payload}.assinatura_fake`;
    const r = await apiRequest('GET', '/submissions', null, expiredToken);
    assert.strictEqual(r.status, 401, `FALHA: token expirado aceito`);
  });

  it('PT-01-F: Endpoint público não vaza stack trace ou env vars', async () => {
    const rotas_publicas = ['/', '/health', '/status', '/api/health'];
    for (const rota of rotas_publicas) {
      const r = await apiRequest('GET', rota, null, null);
      const body = JSON.stringify(r.data || '');
      assert.ok(!body.includes('ANTHROPIC_API_KEY'), `FALHA: API key vazada em ${rota}`);
      assert.ok(!body.includes('supabase'), `ALERTA: credencial Supabase exposta em ${rota}`);
      assert.ok(!body.includes('at Object.<anonymous>'), `ALERTA: stack trace exposto em ${rota}`);
    }
  });

  it('PT-01-G: Rotas não-documentadas comuns não estão acessíveis sem auth', async () => {
    const WORDLIST_COMUM = [
      '/admin', '/admin/users', '/admin/submissions',
      '/api/admin', '/api/users', '/api/debug',
      '/debug', '/debug/env', '/debug/config',
      '/metrics', '/actuator', '/actuator/env',
      '/v1/submissions', '/v2/submissions',
      '/internal', '/internal/stats',
      '/users', '/users/list',
      '/config', '/env',
      '/swagger', '/swagger-ui', '/api-docs', '/openapi.json',
      '/graphql', '/playground',
      '/.env', '/.git/config', '/package.json',
    ];

    const rotas_expostas = [];

    for (const rota of WORDLIST_COMUM) {
      const r = await apiRequest('GET', rota, null, null);
      if (![401, 403, 404, 405].includes(r.status)) {
        rotas_expostas.push({ rota, status: r.status });
        console.log(`ALERTA PT-01-G: ${rota} respondeu ${r.status} sem autenticação`);
      }
    }

    const rotasComDados = rotas_expostas.filter(r => r.status >= 200 && r.status < 300);
    assert.strictEqual(rotasComDados.length, 0,
      `FALHA CRÍTICA: rotas acessíveis sem auth: ${JSON.stringify(rotasComDados)}`);
  });

  it('PT-01-H: DELETE /submissions/:id não está acessível sem autenticação', async () => {
    if (!submissionIdValido) {
      console.log('PT-01-H: pulado — sem submission_id de setup');
      return;
    }
    const r = await apiRequest('DELETE', `/submissions/${submissionIdValido}`, null, null);
    assert.ok(
      r.status === 401 || r.status === 403 || r.status === 404 || r.status === 405,
      `ALERTA: DELETE /submissions/:id sem auth retornou ${r.status}`
    );
  });

  it('PT-01-I: DELETE /submissions/:id não permite deletar submissão de outro usuário', async () => {
    if (!submissionIdValido) {
      console.log('PT-01-I: pulado — sem submission_id de setup');
      return;
    }
    const b = await login(process.env.PENTEST_EMAIL_B, process.env.PENTEST_PASSWORD);
    const r = await apiRequest('DELETE', `/submissions/${submissionIdValido}`, null, b.token);
    assert.ok(
      r.status === 403 || r.status === 404 || r.status === 405,
      `FALHA CRÍTICA: usuário B conseguiu chamar DELETE na submissão de A (status ${r.status})`
    );
  });

  it('PT-01-J: PATCH /submissions/:id não permite modificar submissão sem auth', async () => {
    if (!submissionIdValido) return;
    const r = await apiRequest('PATCH', `/submissions/${submissionIdValido}`,
      { nota_total: 1000 }, null);
    assert.ok(
      r.status === 401 || r.status === 403 || r.status === 404 || r.status === 405,
      `ALERTA: PATCH sem auth retornou ${r.status} — possível manipulação de nota`
    );
  });
});
