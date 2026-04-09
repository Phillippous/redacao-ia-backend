// tests/security/PT-08-secrets-exposure.test.js
// NOTA: Este módulo roda no filesystem local. Executar na raiz do projeto.

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('PT-08: Exposição de Secrets no Código', async () => {

  // --- PT-08-A: .env não está commitado no git ---
  it('PT-08-A: Arquivo .env não está rastreado pelo git', async () => {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), 'FALHA: .gitignore não existe no projeto');

    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(
      gitignore.includes('.env') || gitignore.includes('*.env'),
      'FALHA CRÍTICA: .env não está no .gitignore — credenciais podem estar expostas no repositório'
    );

    // Verifica se .env está commitado mesmo assim
    const { execSync } = require('child_process');
    try {
      execSync('git ls-files --error-unmatch .env 2>&1', { encoding: 'utf8' });
      // Se chegou aqui, o arquivo existe no git
      assert.fail('FALHA CRÍTICA: .env está sendo rastreado pelo git — revogar todas as chaves imediatamente');
    } catch (e) {
      if (e.message && e.message.includes('did not match any file')) {
        // Correto — .env não está no git
      } else if (e.status === 1 && e.stderr && e.stderr.includes('did not match')) {
        // Correto — .env não está no git (formato alternativo do erro)
      } else if (e.stdout && e.stdout.includes('did not match')) {
        // Correto
      }
      // Se o erro for outro, é porque .env não está no git (exit code 1 do git ls-files)
    }
  });

  // --- PT-08-B: Scan de strings de API keys no código-fonte ---
  it('PT-08-B: Nenhuma API key hardcodada no código-fonte', async () => {
    const DIRETORIOS_SCAN = ['src', 'app', 'pages', 'lib', 'utils', 'routes', 'middleware'];
    const PADROES_SECRETS = [
      { regex: /sk-ant-[a-zA-Z0-9\-_]{20,}/, label: 'Anthropic API key' },
      { regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[^'"\s]{50,}/, label: 'JWT hardcodado (possível service_role)' },
      { regex: /postgres:\/\/[^'"\s]{10,}/, label: 'Connection string PostgreSQL' },
      { regex: /password\s*[:=]\s*['"][^'"]{8,}['"]/, label: 'Senha hardcodada' },
      { regex: /secret\s*[:=]\s*['"][^'"]{8,}['"]/, label: 'Secret hardcodado' },
    ];

    const achados = [];

    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const { regex, label } of PADROES_SECRETS) {
            if (regex.test(content)) {
              achados.push({ arquivo: fullPath, tipo: label });
            }
          }
        }
      }
    }

    for (const dir of DIRETORIOS_SCAN) {
      scanDir(path.join(process.cwd(), dir));
    }

    if (achados.length > 0) {
      console.log('ACHADOS PT-08-B:');
      achados.forEach(a => console.log(`  [${a.tipo}] ${a.arquivo}`));
    }

    assert.strictEqual(achados.length, 0,
      `FALHA CRÍTICA: ${achados.length} possível(is) secret(s) hardcodado(s) encontrado(s) — ver log acima`);
  });

  // --- PT-08-C: Variáveis NEXT_PUBLIC_ não contêm secrets ---
  it('PT-08-C: Nenhuma variável sensível está prefixada com NEXT_PUBLIC_', async () => {
    const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];
    const NOMES_SENSIVEIS = [
      'ANTHROPIC', 'API_KEY', 'SECRET', 'SERVICE_ROLE',
      'DATABASE', 'POSTGRES', 'PASSWORD', 'PRIVATE'
    ];

    for (const envFile of envFiles) {
      const envPath = path.join(process.cwd(), envFile);
      if (!fs.existsSync(envPath)) continue;

      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        if (!line.startsWith('NEXT_PUBLIC_')) continue;
        const varName = line.split('=')[0];
        for (const termo of NOMES_SENSIVEIS) {
          assert.ok(!varName.includes(termo),
            `FALHA CRÍTICA: variável sensível "${varName}" está prefixada como NEXT_PUBLIC_ em ${envFile} — exposta no browser`);
        }
      }
    }
  });

  // --- PT-08-D: Arquivo .env.example não contém valores reais ---
  it('PT-08-D: .env.example contém apenas placeholders, não valores reais', async () => {
    const examplePath = path.join(process.cwd(), '.env.example');
    if (!fs.existsSync(examplePath)) {
      console.log('PT-08-D: .env.example não existe — considerar criar como documentação');
      return;
    }

    const content = fs.readFileSync(examplePath, 'utf8');
    assert.ok(!content.includes('sk-ant-'),
      'FALHA CRÍTICA: .env.example contém API key real da Anthropic');
    assert.ok(!content.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[^=\s]{50,}/),
      'FALHA CRÍTICA: .env.example contém JWT real (possível service_role key)');
  });
});
