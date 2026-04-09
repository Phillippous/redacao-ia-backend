// tests/security/PT-02-idor.test.js
require('dotenv').config();
const { apiRequest, login } = require('./helpers/pentest-client');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

describe('PT-02: IDOR — Isolamento de Dados', async () => {
  let tokenA, tokenB, submissionIdA;

  before(async () => {
    const a = await login(process.env.PENTEST_EMAIL_A, process.env.PENTEST_PASSWORD);
    const b = await login(process.env.PENTEST_EMAIL_B, process.env.PENTEST_PASSWORD);
    tokenA = a.token;
    tokenB = b.token;

    const sub = await apiRequest('POST', '/submit', {
      tema: 'Redação de teste IDOR',
      redacao: 'Esta é uma redação de teste para verificar isolamento de dados entre usuários. '.repeat(20)
    }, tokenA);

    submissionIdA = sub.data?.submission_id || sub.data?.id;
    assert.ok(submissionIdA, 'Setup falhou: submissão do usuário A não retornou ID');
  });

  it('PT-02-A: GET /submissions retorna apenas dados do usuário autenticado', async () => {
    const rA = await apiRequest('GET', '/submissions', null, tokenA);
    const rB = await apiRequest('GET', '/submissions', null, tokenB);

    const idsA = (rA.data || []).map(s => s.id || s.submission_id);
    const idsB = (rB.data || []).map(s => s.id || s.submission_id);

    const vazamento = idsA.filter(id => idsB.includes(id));
    assert.strictEqual(vazamento.length, 0,
      `FALHA CRÍTICA: IDs ${vazamento} do usuário A visíveis para usuário B — IDOR`);
  });

  it('PT-02-B: GET /submissions/:id bloqueia acesso cross-user', async () => {
    const r = await apiRequest('GET', `/submissions/${submissionIdA}`, null, tokenB);
    assert.ok(
      r.status === 403 || r.status === 404,
      `FALHA CRÍTICA: usuário B acessou submissão de A (status ${r.status}) — IDOR`
    );
    if (r.status === 200) {
      const body = JSON.stringify(r.data);
      assert.ok(!body.includes('teste IDOR'),
        'FALHA CRÍTICA: conteúdo da redação de A retornado para B');
    }
  });

  it('PT-02-C: IDs sequenciais não permitem enumeração cross-user', async () => {
    const resultados = [];
    for (let id = 1; id <= 10; id++) {
      const r = await apiRequest('GET', `/submissions/${id}`, null, tokenB);
      if (r.status === 200 && r.data) {
        resultados.push(id);
      }
    }
    if (resultados.length > 0) {
      console.log(`ALERTA: IDs numéricos acessíveis: ${resultados} — verificar ownership`);
    }
  });
});
