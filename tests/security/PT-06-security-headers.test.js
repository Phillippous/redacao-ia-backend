// tests/security/PT-06-security-headers.test.js
require('dotenv').config();
const { describe, it } = require('node:test');
const assert = require('node:assert');

const BASE = process.env.API_URL || 'http://localhost:3001';

describe('PT-06: Security Headers', async () => {

  it('PT-06-A: Backend tem headers de segurança obrigatórios', async () => {
    const r = await fetch(`${BASE}/health`, { method: 'GET' }).catch(() => null);
    if (!r) return;

    const headers = Object.fromEntries(r.headers);
    assert.ok(headers['x-content-type-options'],
      'MELHORIA: X-Content-Type-Options ausente');
    assert.ok(headers['x-frame-options'] || headers['content-security-policy'],
      'MELHORIA: X-Frame-Options ou CSP ausente — risco de clickjacking');
  });

  it('PT-06-B: CORS não permite origem arbitrária', async () => {
    const r = await fetch(`${BASE}/submissions`, {
      method: 'GET',
      headers: {
        'Origin': 'https://site-malicioso.com',
        'Authorization': 'Bearer token_qualquer'
      }
    });
    const corsHeader = r.headers.get('access-control-allow-origin');
    assert.ok(
      corsHeader !== '*' && corsHeader !== 'https://site-malicioso.com',
      `FALHA: CORS permite origem arbitrária (valor: ${corsHeader})`
    );
  });

  it('PT-06-C: OPTIONS preflight retorna apenas métodos necessários', async () => {
    const r = await fetch(`${BASE}/submit`, {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://notaapp.com.br' }
    });
    const allowMethods = r.headers.get('access-control-allow-methods') || '';
    assert.ok(
      !allowMethods.includes('DELETE') && !allowMethods.includes('PUT'),
      `ALERTA: métodos DELETE/PUT expostos via CORS: ${allowMethods}`
    );
  });

  it('PT-06-D: Produção redireciona HTTP para HTTPS', async () => {
    if (!process.env.PROD_URL) {
      console.log('PT-06-D: PROD_URL não definida — pular');
      return;
    }
    const httpUrl = process.env.PROD_URL.replace('https://', 'http://');
    const r = await fetch(httpUrl, { redirect: 'manual' });
    assert.ok(
      r.status === 301 || r.status === 302 || r.status === 308,
      `ALERTA: ${httpUrl} não redireciona para HTTPS (status ${r.status})`
    );
  });
});
