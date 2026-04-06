// QA VERMELHA — Zona Vermelha: Motor de IA (correção ENEM)
//
// Cobre os casos IA-01 a IA-10. Qualquer falha aqui bloqueia deploy.
//
// Executar: node --test tests/qa-vermelha-ia.test.js
// Pré-requisitos: backend rodando, .env configurado, TEST_USER_EMAIL/PASSWORD válidos.

'use strict';

require('dotenv').config();

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const api = require('./helpers/api-client');
const {
  assertSubmitResponseShape,
  assertAllScoresValid,
  assertNotaTotalCorrect,
  assertCascadeRule,
  assertWithinTolerance,
  assertExactScore,
  assertNotaAlta,
  assertDHViolationDetected,
  assertConsistent,
  TOLERANCE,
} = require('./helpers/assertions');
const { calcDesvioMedio, formatDesvioReport } = require('./helpers/stats');

const fixturesSinteticas = require('./fixtures/redacoes-sinteticas.json');
const fixturesNota1000 = require('./fixtures/redacoes-nota-1000.json');
const fixturesNotaZero = require('./fixtures/redacoes-nota-zero.json');
const edgeCases = require('./fixtures/edge-cases.json');

let token;

before(async () => {
  token = await api.getTestToken();
});

// ── IA-01 ─────────────────────────────────────────────────────────────────────

describe('IA-01 — Health check', () => {
  it('GET /health retorna { status: "ok" }', async () => {
    const { status, body } = await api.health();
    assert.strictEqual(status, 200, `Health check falhou: status ${status}`);
    assert.strictEqual(body.status, 'ok', `Health check body: ${JSON.stringify(body)}`);
  });
});

// ── IA-02 ─────────────────────────────────────────────────────────────────────

describe('IA-02 — Redações nota 1000 (INEP)', () => {
  if (fixturesNota1000.redacoes.length === 0) {
    it('SKIP — nenhuma redação nota-1000 no fixture (adicionar textos reais do INEP)', () => {
      console.warn(
        '\n⚠  IA-02 ignorado: fixtures/redacoes-nota-1000.json está vazio.\n' +
        '   Adicione pelo menos 3 textos reais das cartilhas INEP para habilitar este teste.\n'
      );
    });
  } else {
    for (const redacao of fixturesNota1000.redacoes) {
      it(`nota-1000 [${redacao.id || redacao.ano_enem}] deve ter nota_total ≥ 840`, async () => {
        const { status, body } = await api.submitEssay(redacao.tema, redacao.texto, token);
        assert.strictEqual(status, 200, `Submit falhou: ${JSON.stringify(body)}`);
        assertSubmitResponseShape(body);
        assertAllScoresValid(body.competencias);
        assertNotaAlta(body, 840);
      });
    }
  }
});

// ── IA-03 ─────────────────────────────────────────────────────────────────────

describe('IA-03 — Fuga ao tema (C2=0)', () => {
  for (const redacao of fixturesNotaZero.redacoes) {
    it(`[${redacao.id}] ${redacao.tipo}: C2 deve ser 0`, async () => {
      const { status, body } = await api.submitEssay(redacao.tema, redacao.texto, token);
      assert.strictEqual(status, 200, `Submit falhou: ${JSON.stringify(body)}`);
      assertSubmitResponseShape(body);
      assertAllScoresValid(body.competencias);
      assertExactScore(body.competencias, 'c2', 0);
    });
  }

  // G1-A sintética (fuga com erros gramaticais)
  it('[G1-A] fuga ao tema com erros gramaticais: C2 deve ser 0', async () => {
    const r = fixturesSinteticas.redacoes.find(r => r.id === 'G1-A');
    const { status, body } = await api.submitEssay(r.tema, r.texto, token);
    assert.strictEqual(status, 200, `Submit falhou: ${JSON.stringify(body)}`);
    assertExactScore(body.competencias, 'c2', 0);
  });

  // G1-D sintética (fuga sofisticada — QUALITY INDEPENDENCE RULE)
  it('[G1-D] fuga sofisticada (Byung-Chul Han / Skinner): C2 deve ser 0', async () => {
    const r = fixturesSinteticas.redacoes.find(r => r.id === 'G1-D');
    const { status, body } = await api.submitEssay(r.tema, r.texto, token);
    assert.strictEqual(status, 200, `Submit falhou: ${JSON.stringify(body)}`);
    assertExactScore(body.competencias, 'c2', 0);
  });
});

// ── IA-04 ─────────────────────────────────────────────────────────────────────

describe('IA-04 — Regra de cascata (C2=0 → C3=0 e C5=0)', () => {
  for (const redacao of fixturesNotaZero.redacoes) {
    it(`[${redacao.id}] cascata deve ser respeitada quando C2=0`, async () => {
      const { status, body } = await api.submitEssay(redacao.tema, redacao.texto, token);
      assert.strictEqual(status, 200, `Submit falhou: ${JSON.stringify(body)}`);
      assertCascadeRule(body.competencias);
    });
  }
});

// ── IA-05 ─────────────────────────────────────────────────────────────────────

describe('IA-05 — Todas as notas são múltiplos de 40', () => {
  // Testa com as 4 redações sintéticas do Grupo 1 (variedade de perfis)
  const casos = ['G1-A', 'G1-B', 'G1-C', 'G1-D'];
  for (const id of casos) {
    it(`[${id}] todas as notas devem ser múltiplos de 40`, async () => {
      const r = fixturesSinteticas.redacoes.find(r => r.id === id);
      const { status, body } = await api.submitEssay(r.tema, r.texto, token);
      assert.strictEqual(status, 200, `Submit falhou: ${JSON.stringify(body)}`);
      assertAllScoresValid(body.competencias);
      assertNotaTotalCorrect(body);
    });
  }
});

// ── IA-06 ─────────────────────────────────────────────────────────────────────

describe('IA-06 — Redações sintéticas dentro da tolerância (±40 pts por competência)', () => {
  // Resultados acumulados para IA-10
  const accumulated = [];

  for (const redacao of fixturesSinteticas.redacoes) {
    it(`[${redacao.id}] ${redacao.titulo}`, async () => {
      const { status, body } = await api.submitEssay(redacao.tema, redacao.texto, token);
      assert.strictEqual(status, 200,
        `Submit de ${redacao.id} falhou (${status}): ${JSON.stringify(body)}`
      );
      assertSubmitResponseShape(body);
      assertAllScoresValid(body.competencias);
      assertNotaTotalCorrect(body);
      assertCascadeRule(body.competencias);
      assertWithinTolerance(body.competencias, redacao.gabarito, TOLERANCE);

      accumulated.push({
        id: redacao.id,
        competencias: body.competencias,
        gabarito: redacao.gabarito,
      });
    });
  }

  // IA-10: desvio médio calculado no final dos 12 casos
  it('IA-10 — desvio médio ≤ 40 pts em todas as competências (12 casos)', () => {
    if (accumulated.length < 12) {
      // Não falha aqui se casos anteriores falharam — só reporta
      console.warn(
        `⚠  IA-10: apenas ${accumulated.length} de 12 casos concluídos. ` +
        'Desvio calculado com base nos casos disponíveis.'
      );
    }
    if (accumulated.length === 0) {
      assert.fail('IA-10: nenhum caso disponível para calcular desvio médio');
    }
    const desvio = calcDesvioMedio(accumulated);
    console.log('\n── IA-10 Relatório de Desvio ──\n' + formatDesvioReport(desvio) + '\n');

    assert.ok(desvio.overall <= 40,
      `Desvio médio geral ${desvio.overall.toFixed(1)} > 40 pts`
    );
    for (const [k, v] of Object.entries(desvio.by_competency)) {
      assert.ok(v <= 40,
        `Desvio médio de ${k.toUpperCase()} = ${v.toFixed(1)} > 40 pts`
      );
    }
  });
});

// ── IA-07 ─────────────────────────────────────────────────────────────────────

describe('IA-07 — Consistência (mesma redação, duas submissões)', () => {
  it('G3-A submetida duas vezes deve ter notas dentro de ±40 pts entre as runs', async () => {
    const r = fixturesSinteticas.redacoes.find(r => r.id === 'G3-A');

    const [res1, res2] = await Promise.all([
      api.submitEssay(r.tema, r.texto, token),
      api.submitEssay(r.tema, r.texto, token),
    ]);

    assert.strictEqual(res1.status, 200, `Run 1 falhou: ${JSON.stringify(res1.body)}`);
    assert.strictEqual(res2.status, 200, `Run 2 falhou: ${JSON.stringify(res2.body)}`);

    assertConsistent(res1.body, res2.body, TOLERANCE);
  });
});

// ── IA-08 ─────────────────────────────────────────────────────────────────────

describe('IA-08 — Violação de direitos humanos (C5=0)', () => {
  it('[G2-D] proposta que elimina duplo grau e presunção de inocência: C5 deve ser 0', async () => {
    const r = fixturesSinteticas.redacoes.find(r => r.id === 'G2-D');
    const { status, body } = await api.submitEssay(r.tema, r.texto, token);
    assert.strictEqual(status, 200, `Submit falhou: ${JSON.stringify(body)}`);
    assertSubmitResponseShape(body);
    assertDHViolationDetected(body.competencias);
  });
});

// ── IA-09 ─────────────────────────────────────────────────────────────────────

describe('IA-09 — Edge cases (inputs inválidos rejeitados pelo backend)', () => {
  it('EDGE-01 — texto vazio: deve retornar 400', async () => {
    const ec = edgeCases.branco.find(e => e.id === 'EDGE-01');
    const { status } = await api.submitEssay(ec.tema, ec.texto, token);
    assert.ok([400, 422].includes(status), `Esperado 400/422, recebi ${status}`);
  });

  it('EDGE-02 — texto com apenas espaços: deve retornar 400', async () => {
    const ec = edgeCases.branco.find(e => e.id === 'EDGE-02');
    const { status } = await api.submitEssay(ec.tema, ec.texto, token);
    assert.ok([400, 422].includes(status), `Esperado 400/422, recebi ${status}`);
  });

  it('EDGE-04 — texto abaixo de 50 caracteres: deve retornar 400', async () => {
    const ec = edgeCases.curto.find(e => e.id === 'EDGE-04');
    const { status } = await api.submitEssay(ec.tema, ec.texto, token);
    assert.ok([400, 422].includes(status), `Esperado 400/422, recebi ${status}`);
  });

  it('EDGE-06 — sem campo tema: deve retornar 400', async () => {
    const { status } = await api.submitEssay(null, 'Texto qualquer para teste sem tema.', token);
    assert.ok([400, 422].includes(status), `Esperado 400/422, recebi ${status}`);
  });

  it('EDGE-07 — sem token de autenticação: deve retornar 401', async () => {
    const { status } = await api.submitEssay('Tema', 'Texto com mais de cinquenta caracteres para passar na validação.', null);
    assert.strictEqual(status, 401, `Esperado 401, recebi ${status}`);
  });
});
