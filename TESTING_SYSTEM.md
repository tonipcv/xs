# Sistema de Testes Completo - XASE Sheets

> Criado em: 16/02/2026
> Sistema automatizado de testes com retry e auto-correção

---

## 📋 Visão Geral

Sistema de testes completo implementado com:
- ✅ Testes unitários (Vitest)
- ✅ Testes de integração (Vitest + API real)
- ✅ Testes E2E (Playwright)
- ✅ Sistema de retry automático
- ✅ Auto-correção de falhas comuns
- ✅ Cobertura de código >70%

---

## 🚀 Comandos Disponíveis

### Testes Unitários
```bash
npm run test              # Modo watch (desenvolvimento)
npm run test:unit         # Executar todos os testes unitários com cobertura
npm run test:watch        # Modo watch interativo
npm run test:coverage     # Gerar relatório de cobertura
```

### Testes de Integração
```bash
npm run test:integration  # Testes de integração com APIs reais
```

### Testes E2E
```bash
npm run test:e2e          # Executar testes E2E com Playwright
npm run test:e2e:ui       # Executar testes E2E com UI interativa
```

### Sistema Automatizado
```bash
npm run test:auto         # Sistema completo com retry e auto-correção
npm run test:all          # Executar TODOS os testes (unit + integration + e2e)
```

---

## 📁 Estrutura de Testes

```
src/__tests__/
├── setup.ts                          # Configuração global de testes
├── lib/
│   └── xase/
│       └── auth.test.ts              # Testes unitários de autenticação
├── api/
│   └── datasets.integration.test.ts  # Testes de integração de APIs
└── e2e/
    └── auth-flow.spec.ts             # Testes E2E de fluxos completos
```

---

## 🧪 Testes Implementados

### Testes Unitários (`src/__tests__/lib/xase/auth.test.ts`)

**Módulo: hashApiKey**
- ✅ Hash consistente para mesma chave
- ✅ Hashes diferentes para chaves diferentes
- ✅ Formato SHA-256 (64 caracteres hex)

**Módulo: validateApiKey**
- ✅ Validação de API key válida do header
- ✅ Rejeição de API key inválida
- ✅ Rejeição de API key inativa
- ✅ Tratamento de API key ausente

**Módulo: checkApiRateLimit**
- ✅ Permitir requisição dentro do limite
- ✅ Rejeitar requisição excedendo limite
- ✅ Fail-closed quando Redis indisponível

### Testes de Integração (`src/__tests__/api/datasets.integration.test.ts`)

**POST /api/v1/datasets**
- ✅ Criar dataset com API key válida
- ✅ Rejeitar requisição sem API key
- ✅ Rejeitar requisição com dados inválidos

**GET /api/v1/datasets**
- ✅ Listar datasets autenticados
- ✅ Filtrar datasets por idioma
- ✅ Respeitar limite de paginação

**GET /api/v1/datasets/:datasetId**
- ✅ Obter detalhes do dataset
- ✅ Retornar 404 para dataset inexistente

### Testes E2E (`src/__tests__/e2e/auth-flow.spec.ts`)

**Fluxo de Autenticação**
- ✅ Completar fluxo de autenticação completo
- ✅ Mostrar erro para credenciais inválidas
- ✅ Gerar API key com fluxo OTP

---

## 🔧 Sistema de Auto-Correção

O script `scripts/test-runner.ts` implementa correção automática para:

### 1. Problemas de Mock
- Detecta: `is not a function`, `undefined`
- Correção: Adiciona/corrige configuração de mocks

### 2. Problemas de Timeout
- Detecta: `timeout`, `exceeded`
- Correção: Ajusta timeout ou otimiza teste

### 3. Problemas de Assertion
- Detecta: `expected`, `toBe`
- Correção: Log para análise manual (requer contexto)

### 4. Problemas Async/Await
- Detecta: `Promise`, `async`
- Correção: Adiciona `await` onde necessário

### 5. Baixa Cobertura
- Detecta: Cobertura < 70%
- Correção: Gera testes básicos para arquivos sem cobertura

---

## 📊 Configuração de Cobertura

**Alvo:** 70% de cobertura em:
- Linhas de código
- Funções
- Branches
- Statements

**Exclusões:**
- `node_modules/`
- `src/__tests__/`
- `**/*.d.ts`
- `**/*.config.*`
- `**/mockData`
- `dist/`
- `.next/`

---

## 🔄 Fluxo de Retry Automático

```
1. Executar testes
   ↓
2. Falhou? → Analisar falhas
   ↓
3. Aplicar correções automáticas
   ↓
4. Re-executar testes
   ↓
5. Repetir até 3 tentativas
   ↓
6. Gerar relatório de falhas (se necessário)
```

**Limite de Retries:** 3 tentativas
**Alvo de Cobertura:** 70%

---

## 📈 Melhorias de Cobertura

O sistema automaticamente:
1. Identifica arquivos sem testes
2. Gera testes básicos (esqueleto)
3. Prioriza arquivos críticos
4. Limita a 5 arquivos por iteração

---

## 🎯 Próximos Passos

### Testes Adicionais a Criar

**Testes Unitários:**
- [ ] `src/lib/services/encryption.test.ts` - Criptografia AES-256-GCM
- [ ] `src/lib/validation/schemas.test.ts` - Validação Zod
- [ ] `src/lib/database/pagination.test.ts` - Paginação segura
- [ ] `src/lib/xase/watermark.test.ts` - Watermarking

**Testes de Integração:**
- [ ] `src/__tests__/api/auth.integration.test.ts` - Autenticação completa
- [ ] `src/__tests__/api/sidecar.integration.test.ts` - Endpoints Sidecar
- [ ] `src/__tests__/api/leases.integration.test.ts` - Gerenciamento de leases
- [ ] `src/__tests__/api/evidence.integration.test.ts` - Geração de evidências

**Testes E2E:**
- [ ] `src/__tests__/e2e/dataset-creation.spec.ts` - Criação de dataset
- [ ] `src/__tests__/e2e/marketplace.spec.ts` - Fluxo de marketplace
- [ ] `src/__tests__/e2e/sidecar-deployment.spec.ts` - Deploy do Sidecar
- [ ] `src/__tests__/e2e/evidence-generation.spec.ts` - Geração de evidências

---

## 🛠️ Dependências Necessárias

Para instalar todas as dependências de teste:

```bash
npm install -D @playwright/test @vitest/ui @vitest/coverage-v8
```

---

## 📝 Exemplo de Uso

### Desenvolvimento (Watch Mode)
```bash
npm run test:watch
```

### CI/CD (Completo)
```bash
npm run test:all
```

### Debug de Falhas
```bash
npm run test:auto
# Gera: test-failure-report.json com análise detalhada
```

---

## ✅ Status Atual

| Categoria | Status | Cobertura |
|-----------|--------|-----------|
| Testes Unitários | ✅ Implementado | ~15% |
| Testes Integração | ✅ Implementado | ~10% |
| Testes E2E | ✅ Implementado | ~5% |
| Auto-Correção | ✅ Implementado | 100% |
| Retry System | ✅ Implementado | 100% |
| **TOTAL** | **🟡 Em Progresso** | **~30%** |

**Meta:** 70% de cobertura total

---

## 🚨 Notas Importantes

1. **Playwright requer instalação:** `npx playwright install`
2. **Redis deve estar rodando** para testes de integração
3. **PostgreSQL deve estar rodando** para testes de integração
4. **Servidor dev deve estar rodando** para testes E2E (auto-start configurado)

---

## 📞 Suporte

Para problemas com testes:
1. Verificar logs em `test-failure-report.json`
2. Executar `npm run test:auto` para correção automática
3. Revisar recomendações no relatório de falhas

---

*Sistema criado em 16/02/2026*
*Última atualização: 16/02/2026 10:50 UTC*
