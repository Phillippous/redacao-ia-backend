// Assertion helpers for ENEM scoring validation
// All functions throw AssertionError (from node:assert) on failure.

'use strict';

const assert = require('node:assert/strict');

const VALID_SCORES = new Set([0, 40, 80, 120, 160, 200]);
const TOLERANCE = 40; // default deviation tolerance for gabarito comparison

// ── Score format validation ───────────────────────────────────────────────────

/**
 * Assert that a single competency score is a valid ENEM multiple of 40.
 */
function assertValidScore(score, label = 'score') {
  assert.ok(
    typeof score === 'number' && VALID_SCORES.has(score),
    `${label} must be one of [0,40,80,120,160,200], got: ${score}`
  );
}

/**
 * Assert that all 5 competency scores in a response are valid multiples of 40.
 */
function assertAllScoresValid(competencias) {
  for (const [key, comp] of Object.entries(competencias)) {
    assertValidScore(comp.nota, key);
  }
}

/**
 * Assert that nota_total equals sum of the 5 competency scores.
 */
function assertNotaTotalCorrect(body) {
  const { nota_total, competencias } = body;
  const expected = ['c1', 'c2', 'c3', 'c4', 'c5'].reduce(
    (sum, k) => sum + competencias[k].nota,
    0
  );
  assert.strictEqual(nota_total, expected,
    `nota_total mismatch: expected ${expected}, got ${nota_total}`
  );
}

// ── Cascade rules ─────────────────────────────────────────────────────────────

/**
 * If C2=0, assert C3=0 and C5=0 (cascade rule).
 */
function assertCascadeRule(competencias) {
  if (competencias.c2.nota === 0) {
    assert.strictEqual(competencias.c3.nota, 0,
      `Cascade violated: C2=0 but C3=${competencias.c3.nota} (must be 0)`
    );
    assert.strictEqual(competencias.c5.nota, 0,
      `Cascade violated: C2=0 but C5=${competencias.c5.nota} (must be 0)`
    );
  }
}

// ── Gabarito comparison ───────────────────────────────────────────────────────

/**
 * Assert that each competency score is within `tolerance` points of the gabarito.
 * @param {object} competencias - from the API response
 * @param {object} gabarito     - { c1, c2, c3, c4, c5 }
 * @param {number} tolerance    - default 40
 */
function assertWithinTolerance(competencias, gabarito, tolerance = TOLERANCE) {
  const keys = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const failures = [];
  for (const k of keys) {
    const got = competencias[k].nota;
    const expected = gabarito[k];
    const diff = Math.abs(got - expected);
    if (diff > tolerance) {
      failures.push(`${k.toUpperCase()}: got ${got}, expected ${expected}, diff ${diff} > tolerance ${tolerance}`);
    }
  }
  if (failures.length > 0) {
    assert.fail(`Gabarito desvio excedeu tolerância (${tolerance} pts):\n  ${failures.join('\n  ')}`);
  }
}

/**
 * Assert that a specific competency score matches exactly.
 */
function assertExactScore(competencias, competency, expectedScore) {
  const got = competencias[competency].nota;
  assert.strictEqual(got, expectedScore,
    `${competency.toUpperCase()}: expected exactly ${expectedScore}, got ${got}`
  );
}

// ── Response structure ────────────────────────────────────────────────────────

/**
 * Assert that the submit response has the correct top-level shape.
 */
function assertSubmitResponseShape(body) {
  assert.ok(body.competencias, 'Response missing "competencias" field');
  assert.ok(body.resumo_geral, 'Response missing "resumo_geral" field');
  assert.ok(typeof body.nota_total === 'number', 'Response missing numeric "nota_total"');

  const keys = ['c1', 'c2', 'c3', 'c4', 'c5'];
  for (const k of keys) {
    assert.ok(body.competencias[k], `competencias missing "${k}"`);
    assert.ok(typeof body.competencias[k].nota === 'number', `${k}.nota must be a number`);
    assert.ok(typeof body.competencias[k].diagnostico === 'string', `${k}.diagnostico must be a string`);
    assert.ok(typeof body.competencias[k].pontos_perdidos === 'string', `${k}.pontos_perdidos must be a string`);
  }

  // c5 must have checklist
  const checklist = body.competencias.c5.checklist;
  assert.ok(checklist, 'c5 missing "checklist" field');
  for (const field of ['acao', 'agente', 'meio_modo', 'efeito', 'detalhamento']) {
    assert.ok(typeof checklist[field] === 'boolean', `c5.checklist.${field} must be boolean`);
  }
}

// ── Nota-1000 check ───────────────────────────────────────────────────────────

/**
 * Assert that nota_total is in the high range expected for a nota-1000 essay.
 * We use ≥840 (6 levels above median 600 — 3σ equivalent for this scale).
 */
function assertNotaAlta(body, minTotal = 840) {
  assert.ok(body.nota_total >= minTotal,
    `Nota-1000 essay scored too low: ${body.nota_total} < ${minTotal}`
  );
}

// ── Human rights (DH) check ───────────────────────────────────────────────────

/**
 * Assert that C5=0 (human rights violation detected).
 */
function assertDHViolationDetected(competencias) {
  assert.strictEqual(competencias.c5.nota, 0,
    `DH violation not detected: C5=${competencias.c5.nota} (expected 0)`
  );
}

// ── Consistency check ────────────────────────────────────────────────────────

/**
 * Assert that two results from the same essay are within `tolerance` of each other
 * for each competency.
 */
function assertConsistent(result1, result2, tolerance = TOLERANCE) {
  const keys = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const failures = [];
  for (const k of keys) {
    const diff = Math.abs(result1.competencias[k].nota - result2.competencias[k].nota);
    if (diff > tolerance) {
      failures.push(`${k.toUpperCase()}: run1=${result1.competencias[k].nota}, run2=${result2.competencias[k].nota}, diff=${diff}`);
    }
  }
  if (failures.length > 0) {
    assert.fail(`Consistency check failed (tolerance ${tolerance}):\n  ${failures.join('\n  ')}`);
  }
}

module.exports = {
  TOLERANCE,
  assertValidScore,
  assertAllScoresValid,
  assertNotaTotalCorrect,
  assertCascadeRule,
  assertWithinTolerance,
  assertExactScore,
  assertSubmitResponseShape,
  assertNotaAlta,
  assertDHViolationDetected,
  assertConsistent,
};
