#!/usr/bin/env node
// QA Runner — nota.
//
// Executa todos os módulos de teste em sequência e imprime um relatório final.
// Uso: node tests/run-qa.js [--zone vermelha|amarela|all]
//
// Saída: relatório de aprovação/falha por zona + custo estimado.

'use strict';

require('dotenv').config();

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = __dirname;

// Custo estimado por redação sintética: ~$0.095 (claude-sonnet-4, 1500 max_tokens)
// 12 sintéticas + 2 nota-zero + 1 consistência + edge-cases leves
const ESTIMATED_COST_USD = 1.14;

// ── Configuração de módulos ───────────────────────────────────────────────────

const MODULES = [
  {
    zone: 'vermelha',
    id: 'IA',
    file: 'qa-vermelha-ia.test.js',
    descricao: 'Motor de IA — correção ENEM',
    bloqueiaDeploy: true,
  },
  {
    zone: 'amarela',
    id: 'AUTH',
    file: 'qa-amarela-auth.test.js',
    descricao: 'Autenticação',
    bloqueiaDeploy: false,
  },
  {
    zone: 'amarela',
    id: 'RATE',
    file: 'qa-amarela-ratelimit.test.js',
    descricao: 'Rate limiting',
    bloqueiaDeploy: false,
  },
  {
    zone: 'amarela',
    id: 'LGPD',
    file: 'qa-amarela-lgpd.test.js',
    descricao: 'LGPD / Conformidade',
    bloqueiaDeploy: false,
  },
];

// ── Argumentos CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const zoneFilter = (() => {
  const idx = args.indexOf('--zone');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1].toLowerCase();
  return 'all';
})();

// ── Verificações de ambiente ──────────────────────────────────────────────────

function checkEnv() {
  const required = ['API_URL', 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n❌  Variáveis de ambiente ausentes: ${missing.join(', ')}`);
    console.error('   Configure o arquivo .env antes de executar o suite.\n');
    process.exit(1);
  }
}

// ── Execução de módulo ────────────────────────────────────────────────────────

function runModule(mod) {
  const filePath = path.join(TESTS_DIR, mod.file);
  if (!fs.existsSync(filePath)) {
    return { ...mod, passed: false, output: `Arquivo não encontrado: ${filePath}` };
  }

  const start = Date.now();
  let output = '';
  let passed = false;

  try {
    output = execSync(`node --test "${filePath}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300_000, // 5 min por módulo
      env: { ...process.env },
    });
    passed = true;
  } catch (err) {
    output = err.stdout || err.stderr || err.message || '';
    passed = false;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  return { ...mod, passed, output, elapsed };
}

// ── Relatório ─────────────────────────────────────────────────────────────────

function printReport(results) {
  const sep = '─'.repeat(70);
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  QA SUITE — nota.   |   Relatório Final');
  console.log(`${'═'.repeat(70)}`);

  let deployBlocked = false;

  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    const zone = r.zone === 'vermelha' ? '🔴 VERMELHA' : '🟡 AMARELA ';
    const deploy = r.bloqueiaDeployAndFailed ? ' ← BLOQUEIA DEPLOY' : '';
    console.log(`\n${icon} [${zone}] ${r.id} — ${r.descricao}${deploy}`);
    console.log(`  Arquivo : ${r.file}`);
    console.log(`  Status  : ${r.passed ? 'PASSOU' : 'FALHOU'}`);
    if (r.elapsed) console.log(`  Tempo   : ${r.elapsed}s`);

    if (!r.passed) {
      // Imprimir as últimas 20 linhas do output para diagnóstico
      const lines = r.output.split('\n').filter(Boolean);
      const tail = lines.slice(-20).join('\n  ');
      console.log(`  Output  :\n  ${tail}`);

      if (r.bloqueiaDeployAndFailed) {
        deployBlocked = true;
      }
    }
  }

  // Sumário
  const total = results.length;
  const passou = results.filter(r => r.passed).length;
  const falhou = total - passou;

  console.log(`\n${sep}`);
  console.log(`Resultado: ${passou}/${total} módulos passaram`);
  console.log(`Custo estimado: ~US$ ${ESTIMATED_COST_USD.toFixed(2)}`);

  if (deployBlocked) {
    console.log('\n❌  DEPLOY BLOQUEADO — falhas na Zona Vermelha detectadas.');
    console.log('   Corrija os casos acima antes de publicar.\n');
  } else if (falhou > 0) {
    console.log('\n⚠   Falhas na Zona Amarela — corrigir no próximo sprint.');
    console.log('   Deploy não bloqueado.\n');
  } else {
    console.log('\n✅  Todos os módulos passaram. Deploy liberado.\n');
  }

  console.log(`${'═'.repeat(70)}\n`);
  return deployBlocked ? 1 : 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  checkEnv();

  const filtered = MODULES.filter(m => {
    if (zoneFilter === 'all') return true;
    if (zoneFilter === 'vermelha') return m.zone === 'vermelha';
    if (zoneFilter === 'amarela') return m.zone === 'amarela';
    return m.id.toLowerCase() === zoneFilter;
  });

  if (filtered.length === 0) {
    console.error(`Nenhum módulo corresponde ao filtro: --zone ${zoneFilter}`);
    process.exit(1);
  }

  console.log(`\n🧪  Iniciando QA Suite — ${filtered.length} módulo(s) | zona: ${zoneFilter}`);
  console.log(`    API: ${process.env.API_URL}`);
  console.log(`    Custo estimado: ~US$ ${ESTIMATED_COST_USD.toFixed(2)}\n`);

  const results = [];
  for (const mod of filtered) {
    process.stdout.write(`Executando ${mod.id} (${mod.file})... `);
    const result = runModule(mod);
    result.bloqueiaDeployAndFailed = !result.passed && mod.bloqueiaDeploy;
    results.push(result);
    console.log(result.passed ? 'OK' : 'FALHOU');
  }

  const exitCode = printReport(results);
  process.exit(exitCode);
}

main().catch(err => {
  console.error('\n❌  Erro inesperado no runner:', err.message);
  process.exit(1);
});
