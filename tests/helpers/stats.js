// Statistical helpers for QA suite reporting

'use strict';

/**
 * Calculate mean absolute deviation between model scores and gabarito
 * across an array of { id, competencias, gabarito } results.
 *
 * Returns { overall, by_competency, by_case } where all values are MAD in points.
 */
function calcDesvioMedio(results) {
  const keys = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const byCaseDesvios = [];

  const byComp = Object.fromEntries(keys.map(k => [k, []]));

  for (const { id, competencias, gabarito } of results) {
    const caseDesvios = {};
    let caseSum = 0;
    for (const k of keys) {
      const diff = Math.abs(competencias[k].nota - gabarito[k]);
      caseDesvios[k] = diff;
      byComp[k].push(diff);
      caseSum += diff;
    }
    byCaseDesvios.push({
      id,
      desvio_medio: caseSum / keys.length,
      por_competencia: caseDesvios,
    });
  }

  const byCompMeans = Object.fromEntries(
    keys.map(k => [k, mean(byComp[k])])
  );

  const allDiffs = Object.values(byComp).flat();
  const overall = mean(allDiffs);

  return {
    overall,
    by_competency: byCompMeans,
    by_case: byCaseDesvios,
  };
}

/**
 * Summarise test run results for the runner report.
 * @param {Array<{ id, passed, error?, desvio? }>} results
 */
function summarise(results) {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const passRate = total ? Math.round((passed / total) * 100) : 0;
  return { total, passed, failed, passRate };
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Format a desvio report for console output.
 */
function formatDesvioReport(desvio) {
  const lines = [
    `Desvio médio geral: ${desvio.overall.toFixed(1)} pts`,
    `Por competência:`,
  ];
  for (const [k, v] of Object.entries(desvio.by_competency)) {
    lines.push(`  ${k.toUpperCase()}: ${v.toFixed(1)} pts`);
  }
  lines.push(`Por caso:`);
  for (const c of desvio.by_case) {
    const mark = c.desvio_medio <= 40 ? '✓' : '✗';
    lines.push(`  ${mark} ${c.id}: ${c.desvio_medio.toFixed(1)} pts médio`);
  }
  return lines.join('\n');
}

module.exports = { calcDesvioMedio, summarise, formatDesvioReport, mean };
