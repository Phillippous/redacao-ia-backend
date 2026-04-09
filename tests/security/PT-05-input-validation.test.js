// tests/security/PT-05-input-validation.test.js
require('dotenv').config();
const { apiRequest, login } = require('./helpers/pentest-client');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

describe('PT-05: Validação de Input', async () => {
  let token;

  before(async () => {
    const u = await login(process.env.PENTEST_EMAIL_A, process.env.PENTEST_PASSWORD);
    token = u.token;
  });

  it('PT-05-A: Texto excessivamente longo é rejeitado (> 100.000 chars)', async () => {
    const textoGigante = 'A'.repeat(100_000);
    const r = await apiRequest('POST', '/submit', {
      tema: 'Tema normal',
      redacao: textoGigante
    }, token);
    assert.ok(
      r.status === 400 || r.status === 413 || r.status === 422,
      `FALHA: texto de 100KB aceito (status ${r.status}) — RISCO DE CUSTO DE API.`
    );
  });

  it('PT-05-B: Submissão sem campo "tema" retorna 400', async () => {
    const r = await apiRequest('POST', '/submit', { redacao: 'Texto sem tema. '.repeat(10) }, token);
    assert.ok(r.status === 400 || r.status === 422,
      `FALHA: submissão sem tema aceita (status ${r.status})`);
  });

  it('PT-05-C: Submissão sem campo "redacao" retorna 400', async () => {
    const r = await apiRequest('POST', '/submit', { tema: 'Tema sem redacao' }, token);
    assert.ok(r.status === 400 || r.status === 422,
      `FALHA: submissão sem texto aceita (status ${r.status})`);
  });

  it('PT-05-D: Campos com tipo errado não causam crash 500', async () => {
    const r = await apiRequest('POST', '/submit', {
      tema: 12345,
      redacao: ['array', 'inesperado']
    }, token);
    assert.notStrictEqual(r.status, 500,
      'ALERTA: tipo incorreto no body causou erro 500 — erro não tratado');
  });

  it('PT-05-E: JSON malformado retorna 400, não 500', async () => {
    const r = await fetch(`${process.env.API_URL || 'http://localhost:3001'}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: '{tema: sem aspas, isso nao é json válido'
    });
    assert.notStrictEqual(r.status, 500,
      'ALERTA: JSON malformado causou 500 — erro de parsing não tratado');
  });

  it('PT-05-F: Null bytes no input não causam crash', async () => {
    const r = await apiRequest('POST', '/submit', {
      tema: 'Tema com \x00 null byte',
      redacao: 'Texto com caracteres de controle \x01\x02\x03 no meio do texto normal.'
    }, token);
    assert.notStrictEqual(r.status, 500,
      'ALERTA: null bytes causaram erro 500');
  });

  it('PT-05-G: Caracteres Unicode adversariais tratados sem crash', async () => {
    const r = await apiRequest('POST', '/submit', {
      tema: 'Tema \u202E texto invertido \u200B zero-width',
      redacao: 'Texto normal com \uFEFF BOM e \u0000 null no meio da redação.'
    }, token);
    assert.notStrictEqual(r.status, 500,
      'ALERTA: Unicode adversarial causou 500');
  });
});
