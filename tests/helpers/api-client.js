// HTTP client for the nota. backend API
// Adapts the test suite to the real API routes and response format

'use strict';

const port = process.env.PORT || 3000;
const API_URL = process.env.API_URL || `http://localhost:${port}`;

/**
 * Perform a fetch request and return { status, body }.
 * Never throws — callers inspect status themselves.
 */
async function request(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let parsed;
  const text = await res.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { _raw: text };
  }

  return { status: res.status, body: parsed, headers: res.headers };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * POST /auth/login → { access_token, user }
 */
async function login(email, password) {
  return request('POST', '/auth/login', {
    body: { email, password },
  });
}

/**
 * POST /auth/register → { message } (201)
 */
async function register(email, password) {
  return request('POST', '/auth/register', {
    body: { email, password },
  });
}

/**
 * Obtain a token from TEST_USER_EMAIL / TEST_USER_PASSWORD.
 * Throws if login fails so callers surface the error early.
 */
async function getTestToken() {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env');
  }
  const { status, body } = await login(email, password);
  if (status !== 200 || !body.access_token) {
    throw new Error(
      `Login failed (${status}): ${JSON.stringify(body)}. ` +
      'Ensure the test user exists in Supabase and credentials are correct.'
    );
  }
  return body.access_token;
}

// ── Essay submission ───────────────────────────────────────────────────────────

/**
 * POST /submit — submits an essay for AI correction.
 *
 * Response shape (200):
 *   {
 *     nota_total: number,
 *     competencias: {
 *       c1: { nota, diagnostico, pontos_perdidos },
 *       c2: { nota, diagnostico, pontos_perdidos },
 *       c3: { nota, diagnostico, pontos_perdidos },
 *       c4: { nota, diagnostico, pontos_perdidos },
 *       c5: { nota, diagnostico, pontos_perdidos, checklist: { acao, agente, meio_modo, efeito, detalhamento } }
 *     },
 *     resumo_geral: string,
 *     submission_id: string | null
 *   }
 */
async function submitEssay(tema, redacao, token) {
  return request('POST', '/submit', {
    body: { tema, redacao },
    token,
  });
}

// ── Submissions history ────────────────────────────────────────────────────────

/** GET /submissions — returns list of user's past submissions */
async function getSubmissions(token) {
  return request('GET', '/submissions', { token });
}

/** GET /submissions/:id */
async function getSubmission(id, token) {
  return request('GET', `/submissions/${id}`, { token });
}

// ── Health ────────────────────────────────────────────────────────────────────

/** GET /health → { status: 'ok' } */
async function health() {
  return request('GET', '/health');
}

module.exports = {
  API_URL,
  request,
  login,
  register,
  getTestToken,
  submitEssay,
  getSubmissions,
  getSubmission,
  health,
};
