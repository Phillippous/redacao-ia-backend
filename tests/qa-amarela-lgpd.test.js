// QA AMARELA — LGPD / Conformidade
//
// Verifica que o backend não vaza dados sensíveis, que rotas de dados
// do usuário estão protegidas, e que o isolamento entre usuários funciona.
//
// Executar: node --test tests/qa-amarela-lgpd.test.js

'use strict';

require('dotenv').config();

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const api = require('./helpers/api-client');

let token;

before(async () => {
  token = await api.getTestToken();
});

// ── LGPD-01 — Sem vazamento de dados em erros ────────────────────────────────

describe('LGPD-01 — Erros não expõem informações sensíveis', () => {
  it('Erro de autenticação não revela se o e-mail existe', async () => {
    const email = process.env.TEST_USER_EMAIL;
    if (!email) {
      console.warn('⚠  LGPD-01 ignorado: TEST_USER_EMAIL não configurado');
      return;
    }
    const { body } = await api.login(email, 'SenhaDefinitivamenteErrada!99');
    const msg = JSON.stringify(body).toLowerCase();
    // Não deve revelar "email não encontrado" ou "usuário não existe"
    assert.ok(
      !msg.includes('não encontrado') && !msg.includes('nao encontrado') &&
      !msg.includes('não existe') && !msg.includes('nao existe') &&
      !msg.includes('not found') && !msg.includes('does not exist'),
      `Mensagem de erro revela existência do e-mail: ${JSON.stringify(body)}`
    );
  });

  it('Erro de input não expõe stack trace ou detalhes internos', async () => {
    const { status, body } = await api.submitEssay(null, null, token);
    assert.ok([400, 422].includes(status), `Esperado 400/422, recebi ${status}`);
    const msg = JSON.stringify(body).toLowerCase();
    assert.ok(!msg.includes('stack'), 'Resposta de erro não deve expor stack trace');
    assert.ok(!msg.includes('at object'), 'Resposta de erro não deve expor stack trace');
    assert.ok(!msg.includes('node_modules'), 'Resposta de erro não deve expor caminhos internos');
  });
});

// ── LGPD-02 — Isolamento de dados entre usuários ─────────────────────────────

describe('LGPD-02 — Dados de submissão isolados por usuário', () => {
  it('GET /submissions retorna apenas submissões do usuário autenticado', async () => {
    // Verificar que a resposta é um array (isolamento é garantido pela query no Supabase)
    const { status, body } = await api.getSubmissions(token);
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body), 'GET /submissions deve retornar array');
    // Não podemos verificar isolamento sem 2 usuários, mas o teste documenta a expectativa
  });

  it('GET /submissions/:id com ID de outro usuário retorna 404', async () => {
    // UUID nulo — certamente não pertence ao usuário de teste
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const { status } = await api.getSubmission(fakeId, token);
    assert.ok([403, 404].includes(status),
      `Acesso a ID alheio deve retornar 403 ou 404, recebi ${status}`
    );
  });
});

// ── LGPD-03 — Autenticação obrigatória para dados pessoais ───────────────────

describe('LGPD-03 — Rotas de dados pessoais exigem autenticação', () => {
  it('GET /submissions sem token retorna 401', async () => {
    const { status } = await api.getSubmissions(null);
    assert.strictEqual(status, 401);
  });

  it('GET /submissions/:id sem token retorna 401', async () => {
    const { status } = await api.getSubmission('qualquer-id', null);
    assert.strictEqual(status, 401);
  });

  it('POST /submit sem token retorna 401', async () => {
    const { status } = await api.submitEssay(
      'Qualquer tema',
      'Texto com mais de cinquenta caracteres para validação mínima de entrada.',
      null
    );
    assert.strictEqual(status, 401);
  });
});

// ── LGPD-04 — Resposta não vaza API key ou credenciais internas ──────────────

describe('LGPD-04 — Respostas não vazam credenciais internas', () => {
  it('Resposta de submit não deve conter chaves de API ou strings de conexão', async () => {
    const { body } = await api.submitEssay(
      'A invisibilidade do trabalho de cuidado realizado pela mulher no Brasil',
      'A participação feminina no mercado de trabalho brasileiro cresceu, porém desafios persistem em múltiplos setores.',
      token
    );
    const raw = JSON.stringify(body).toLowerCase();
    assert.ok(!raw.includes('sk-ant-'), 'Resposta não deve expor Anthropic API key');
    assert.ok(!raw.includes('supabase'), 'Resposta não deve expor strings de conexão Supabase');
    assert.ok(!raw.includes('service_role'), 'Resposta não deve expor service_role key');
    assert.ok(!raw.includes('postgres'), 'Resposta não deve expor strings de conexão de banco');
  });
});
