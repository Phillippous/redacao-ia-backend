// helpers/report.js
// Utilitário simples para formatar resultados do pentest

const SEVERITY = {
  CRITICO: '🔴 CRÍTICO',
  ALTO:    '🟠 ALTO',
  MEDIO:   '🟡 MÉDIO',
  INFO:    '🔵 INFO',
};

function achado(severidade, id, descricao, detalhe = '') {
  const nivel = SEVERITY[severidade] || severidade;
  console.log(`\n${nivel} [${id}] ${descricao}`);
  if (detalhe) console.log(`   Detalhe: ${detalhe}`);
}

function secao(titulo) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${titulo}`);
  console.log('='.repeat(60));
}

module.exports = { achado, secao, SEVERITY };
