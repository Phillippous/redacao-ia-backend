# QA Test Suite — nota.

Suite de testes automatizados para a plataforma nota. (correção de redações ENEM por IA).

---

## O que o suite testa

### Zona Vermelha — Motor de IA (bloqueia deploy)

| Caso  | O que testa                                                        |
|-------|--------------------------------------------------------------------|
| IA-01 | Health check (`GET /health`)                                       |
| IA-02 | Redações nota-1000 (INEP): `nota_total ≥ 840`                      |
| IA-03 | Detecção de fuga ao tema: `C2 = 0`                                 |
| IA-04 | Regra de cascata: `C2=0 → C3=0 e C5=0`                            |
| IA-05 | Todas as notas são múltiplos de 40                                 |
| IA-06 | 12 redações sintéticas dentro da tolerância (±40 pts/competência) |
| IA-07 | Consistência: mesma redação submetida 2x → desvio ≤ 40 pts        |
| IA-08 | Violação de direitos humanos detectada: `C5 = 0`                  |
| IA-09 | Inputs inválidos rejeitados com 400/401 pelo backend               |
| IA-10 | Desvio médio ≤ 40 pts em todas as competências (12 casos)         |

### Zona Amarela — Autenticação (não bloqueia deploy)

| Caso    | O que testa                                                  |
|---------|--------------------------------------------------------------|
| AUTH-01 | Login com credenciais válidas retorna `access_token`         |
| AUTH-02 | Login com senha errada retorna 401                           |
| AUTH-03 | Token inválido rejeitado em rota protegida                   |
| AUTH-04 | Rota protegida acessível com token válido                    |
| AUTH-05 | `GET /submissions/:id` não expõe dados de outros usuários   |

### Zona Amarela — Rate Limiting (não bloqueia deploy)

| Caso    | O que testa                                                  |
|---------|--------------------------------------------------------------|
| RATE-01 | Headers de rate limit presentes nas respostas                |
| RATE-02 | 429 após atingir o limite (requer `RATE_LIMIT_MAX ≤ 5`)      |
| RATE-03 | Mensagem 429 é amigável e indica tempo de espera             |

### Zona Amarela — LGPD / Conformidade (não bloqueia deploy)

| Caso    | O que testa                                                       |
|---------|-------------------------------------------------------------------|
| LGPD-01 | Erros não expõem stack trace nem revelam existência de e-mail     |
| LGPD-02 | Submissões isoladas por usuário                                   |
| LGPD-03 | Todas as rotas de dados pessoais exigem autenticação              |
| LGPD-04 | Respostas não vazam chaves de API ou strings de conexão           |

---

## Pré-requisitos

- **Node 18+** (usa `node:test` nativo)
- **Backend rodando** localmente ou em staging
- **Arquivo `.env`** configurado (ver `.env.example`)
- **Usuário de teste** pré-cadastrado no Supabase

### Criar usuário de teste

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@nota.app","password":"SenhaForte123!"}'
```

Ou criar diretamente no painel do Supabase → Authentication → Users.

---

## Comandos

### Suite completa (todas as zonas)

```bash
npm test
# ou
node tests/run-qa.js
```

### Apenas Zona Vermelha (motor de IA)

```bash
npm run test:ia
# ou
node --test tests/qa-vermelha-ia.test.js
```

### Apenas módulo específico

```bash
npm run test:auth    # autenticação
npm run test:rate    # rate limiting
npm run test:lgpd    # LGPD / conformidade
```

### Filtrando por zona no runner

```bash
node tests/run-qa.js --zone vermelha
node tests/run-qa.js --zone amarela
```

---

## Interpretação dos resultados

### O que bloqueia deploy

**Qualquer falha na Zona Vermelha** (módulo `qa-vermelha-ia.test.js`) bloqueia deploy.

Critérios específicos de bloqueio:
- `IA-03`: modelo deu C2 > 0 para redação com fuga ao tema
- `IA-04`: cascade não foi respeitada (C2=0 mas C3 ou C5 > 0)
- `IA-05`: alguma nota não é múltiplo de 40
- `IA-06`/`IA-10`: desvio > 40 pts em qualquer competência dos 12 casos sintéticos
- `IA-08`: violação de DH não detectada (C5 > 0 quando deveria ser 0)
- `IA-09`: backend não rejeita inputs inválidos com 400/401

### O que não bloqueia deploy

Falhas na **Zona Amarela** não bloqueiam deploy imediato, mas devem ser corrigidas no próximo sprint. Falhas repetidas ou relacionadas a segurança (LGPD-03, LGPD-04) devem ser priorizadas.

---

## Custo estimado

Cada execução completa do suite consome aproximadamente **US$ 1.14** em créditos Anthropic:

- 12 redações sintéticas × ~$0.07 = ~$0.84
- 2 redações nota-zero × ~$0.07 = ~$0.14
- 1 teste de consistência (2 submissões) = ~$0.14
- Edge cases e testes leves: ~$0.02

Redações nota-1000 (IA-02) adicionam custo se configuradas no fixture.

Para reduzir custo em CI:
1. Execute apenas `test:ia` nas execuções automatizadas
2. Reserve `npm test` (suite completa) para validação pré-deploy manual
3. Implemente cache de resultados de redações sintéticas para reruns

---

## Estrutura dos arquivos

```
tests/
├── fixtures/
│   ├── redacoes-sinteticas.json    ← 12 redações com gabarito (construídas)
│   ├── redacoes-nota-1000.json     ← Redações reais INEP (adicionar manualmente)
│   ├── redacoes-nota-zero.json     ← Casos de fuga ao tema (extraídos de G1-A e G1-D)
│   └── edge-cases.json             ← Inputs inválidos (vazio, curto, sem auth)
├── helpers/
│   ├── api-client.js               ← HTTP client adaptado à API real
│   ├── assertions.js               ← Funções de asserção para scores ENEM
│   └── stats.js                    ← Cálculo de desvio médio e relatórios
├── qa-vermelha-ia.test.js          ← Zona Vermelha: motor de IA (IA-01 a IA-10)
├── qa-amarela-auth.test.js         ← Zona Amarela: autenticação
├── qa-amarela-ratelimit.test.js    ← Zona Amarela: rate limiting
├── qa-amarela-lgpd.test.js         ← Zona Amarela: LGPD / conformidade
├── run-qa.js                       ← Runner principal com relatório
└── README.md                       ← Este arquivo
```

---

## Adicionar redações nota-1000

O arquivo `fixtures/redacoes-nota-1000.json` está vazio por padrão. Para habilitar o teste IA-02, adicione textos reais das cartilhas INEP:

```json
{
  "redacoes": [
    {
      "id": "INEP-2023-01",
      "ano_enem": 2023,
      "tema": "A invisibilidade do trabalho de cuidado realizado pela mulher no Brasil",
      "texto": "<texto completo copiado da cartilha INEP>"
    }
  ]
}
```

Fontes: https://www.gov.br/inep → Educação Básica → Enem → Redação → Cartilha do Participante.
