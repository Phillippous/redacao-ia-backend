// QA AMARELA — Autenticação
//
// Testa os fluxos de login, acesso autenticado e rejeição de tokens inválidos.
// Falhas aqui não bloqueiam deploy, mas devem ser corrigidas no próximo sprint.
//
// Executar: node --test tests/qa-amarela-auth.test.js

'use strict';

require('dotenv').config();

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const api = require('./helpers/api-client');

// ── Auth-01: Login válido ─────────────────────────────────────────────────────

describe('AUTH-01 — Login com credenciais válidas', () => {
  it('POST /auth/login retorna access_token e user', async () => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;

    if (!email || !password) {
      assert.fail('TEST_USER_EMAIL e TEST_USER_PASSWORD devem estar no .env');
    }

    const { status, body } = await api.login(email, password);
    assert.strictEqual(status, 200, `Login falhou (${status}): ${JSON.stringify(body)}`);
    assert.ok(typeof body.access_token === 'string' && body.access_token.length > 0,
      'access_token ausente ou vazio'
    );
    assert.ok(body.user && body.user.id, 'user.id ausente na resposta de login');
    assert.ok(body.user && body.user.email, 'user.email ausente na resposta de login');
  });
});

// ── Auth-02: Login inválido ───────────────────────────────────────────────────

describe('AUTH-02 — Login com senha incorreta', () => {
  it('POST /auth/login com senha errada retorna 401', async () => {
    const email = process.env.TEST_USER_EMAIL;
    if (!email) assert.fail('TEST_USER_EMAIL deve estar no .env');

    const { status, body } = await api.login(email, 'SenhaErrada!!!999');
    assert.strictEqual(status, 401, `Esperado 401, recebi ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.error, 'Resposta 401 deve conter campo "error"');
  });
});

// ── Auth-03: Token inválido rejeitado ─────────────────────────────────────────

describe('AUTH-03 — Token inválido rejeitado em rota protegida', () => {
  it('POST /submit com token falso retorna 401', async () => {
    const { status } = await api.submitEssay(
      'Qualquer tema',
      'Texto com mais de cinquenta caracteres para passar na validação mínima.',
      'token-invalido-nao-e-jwt-valido'
    );
    assert.strictEqual(status, 401, `Esperado 401, recebi ${status}`);
  });

  it('GET /submissions sem token retorna 401', async () => {
    const { status } = await api.getSubmissions(null);
    assert.strictEqual(status, 401, `Esperado 401, recebi ${status}`);
  });
});

// ── Auth-04: Acesso autenticado funciona ─────────────────────────────────────

describe('AUTH-04 — Rota protegida acessível com token válido', () => {
  it('GET /submissions com token válido retorna 200', async () => {
    const token = await api.getTestToken();
    const { status, body } = await api.getSubmissions(token);
    assert.strictEqual(status, 200, `Esperado 200, recebi ${status}: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body), 'GET /submissions deve retornar array');
  });
});

// ── Auth-05: Isolamento de dados ─────────────────────────────────────────────

describe('AUTH-05 — GET /submissions/:id não expõe dados de outros usuários', () => {
  it('ID de submissão inexistente ou de outro usuário retorna 404', async () => {
    const token = await api.getTestToken();
    // UUID válido no formato mas que certamente não pertence ao usuário de teste
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const { status } = await api.getSubmission(fakeId, token);
    assert.ok([403, 404].includes(status),
      `Esperado 403 ou 404 para ID alheio, recebi ${status}`
    );
  });
});
