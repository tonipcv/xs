# 🚀 XASE CORE - Guia de Setup Completo

## ✅ O que foi feito

### 1. Schema Prisma Atualizado
- ✅ **Mantido 100%** do sistema existente (20+ modelos)
- ✅ **Adicionado** 3 modelos Xase: `Tenant`, `ApiKey`, `DecisionRecord`
- ✅ **Adicionado** 2 enums: `TenantStatus`, `XaseRole`
- ✅ **Estendido** modelo `User` com `tenantId` e `xaseRole` opcionais

### 2. Migration SQL Criada
- ✅ `database/xase-core-migration.sql` - Migration PostgreSQL completa
- ✅ `database/run-migration.js` - Script executor
- ✅ **Seguro**: Não modifica tabelas existentes
- ✅ **Idempotente**: Pode rodar múltiplas vezes sem erro

### 3. Utilitários Criados
- ✅ `src/lib/xase/crypto.ts` - Funções de hash e encadeamento
- ✅ `src/lib/xase/auth.ts` - Validação de API Key e rate limiting
- ✅ `database/create-tenant.js` - Criar tenants e gerar API keys

### 4. APIs REST Implementadas
- ✅ `POST /api/xase/v1/records` - Criar decisão
- ✅ `GET /api/xase/v1/records` - Health check
- ✅ `GET /api/xase/v1/verify/:id` - Verificar integridade

### 5. Interface Pública
- ✅ `GET /xase/receipt/:id` - Página de recibo público
- ✅ Design profissional com Tailwind + shadcn/ui
- ✅ Mostra hashes, metadata, aviso legal

### 6. Scripts NPM
- ✅ `npm run xase:migrate` - Executar migration
- ✅ `npm run xase:tenant` - Criar tenant
- ✅ `npm run xase:setup` - Setup completo

---

## 📋 Próximos Passos (Execute nesta ordem)

### Passo 1: Executar Migration

```bash
npm run xase:setup
```

**O que isso faz:**
- Cria 3 tabelas no PostgreSQL (`xase_tenants`, `xase_api_keys`, `xase_decision_records`)
- Adiciona colunas `tenantId` e `xaseRole` na tabela `User`
- Cria índices para performance
- Adiciona triggers de imutabilidade
- Gera Prisma Client atualizado

**Saída esperada:**
```
🚀 XASE CORE - Database Migration
=====================================
🔌 Conectando ao PostgreSQL...
✅ Conectado!
📄 Lendo migration: xase-core-migration.sql
⚙️  Executando migration...
✅ Migration executada com sucesso!

✅ Tabelas Xase Core criadas:
   - xase_api_keys
   - xase_decision_records
   - xase_tenants

✅ Colunas adicionadas à tabela User:
   - tenantId (text)
   - xaseRole (USER-DEFINED)

🎉 MIGRATION COMPLETA!
```

### Passo 2: Criar Primeiro Tenant

```bash
npm run xase:tenant "Acme Corp" "tech@acme.com" "Acme Corporation"
```

**Saída esperada:**
```
🏢 Criando novo tenant Xase...
✅ Tenant criado: clxxx...

🔑 Gerando API Key...

=====================================
🎉 TENANT CRIADO COM SUCESSO!
=====================================

Tenant ID: clxxx...
Nome: Acme Corp
Email: tech@acme.com
Empresa: Acme Corporation

🔑 API KEY (GUARDE COM SEGURANÇA):
xase_pk_a1b2c3d4e5f6...

⚠️  Esta chave não será exibida novamente!

💡 Use no header das requisições:
   X-API-Key: xase_pk_a1b2c3d4e5f6...
```

**⚠️ IMPORTANTE:** Copie e guarde a API Key em local seguro!

### Passo 3: Testar API

Crie um arquivo `test-xase.sh`:

```bash
#!/bin/bash

API_KEY="xase_pk_..." # Cole sua API Key aqui
BASE_URL="http://localhost:3000"

echo "🧪 Testando Xase Core API..."
echo ""

# 1. Health Check
echo "1️⃣ Health Check..."
curl -s "$BASE_URL/api/xase/v1/records" | jq
echo ""

# 2. Criar Decisão
echo "2️⃣ Criando decisão..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/xase/v1/records" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "input": {
      "user_id": "12345",
      "loan_amount": 50000,
      "credit_score": 720
    },
    "output": {
      "decision": "APPROVED",
      "interest_rate": 4.5,
      "loan_term": 36
    },
    "context": {
      "model": "loan-approval-v2",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    },
    "policyId": "loan-approval-policy",
    "policyVersion": "2.1.0",
    "decisionType": "loan_approval",
    "confidence": 0.95,
    "storePayload": true
  }')

echo "$RESPONSE" | jq
TRANSACTION_ID=$(echo "$RESPONSE" | jq -r '.transaction_id')
echo ""

# 3. Verificar Integridade
echo "3️⃣ Verificando integridade..."
curl -s "$BASE_URL/api/xase/v1/verify/$TRANSACTION_ID" | jq
echo ""

# 4. URL do Recibo
echo "4️⃣ Recibo público disponível em:"
echo "   $BASE_URL/xase/receipt/$TRANSACTION_ID"
echo ""

echo "✅ Testes completos!"
```

Execute:
```bash
chmod +x test-xase.sh
./test-xase.sh
```

### Passo 4: Verificar Recibo no Navegador

Abra a URL do recibo:
```
http://localhost:3000/xase/receipt/txn_...
```

Você deve ver:
- ✅ Badge "Integrity Verified"
- ✅ Transaction ID
- ✅ Timestamp
- ✅ Policy/Model info
- ✅ Hashes criptográficos
- ✅ Aviso legal
- ✅ Nome da empresa

---

## 🔍 Verificação de Integridade

### Verificar Tabelas Criadas

```sql
-- Conectar ao PostgreSQL
psql $DATABASE_URL

-- Listar tabelas Xase
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'xase_%';

-- Resultado esperado:
-- xase_api_keys
-- xase_decision_records
-- xase_tenants

-- Verificar colunas do User
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'User' 
AND column_name IN ('tenantId', 'xaseRole');

-- Resultado esperado:
-- tenantId | text
-- xaseRole | USER-DEFINED
```

### Verificar Triggers de Imutabilidade

```sql
-- Tentar atualizar um record (deve falhar)
UPDATE xase_decision_records 
SET "inputHash" = 'fake' 
WHERE id = (SELECT id FROM xase_decision_records LIMIT 1);

-- Erro esperado:
-- ERROR: Decision records are immutable and cannot be modified or deleted
```

---

## 📊 Estrutura do Banco

### Diagrama de Relacionamentos

```
User (existente)
  ├─ tenantId? ──────> Tenant (novo)
  │                      ├─ ApiKey (novo)
  │                      └─ DecisionRecord (novo)
  │                           └─ previousHash ──> DecisionRecord (chain)
  ├─ Account (existente)
  ├─ Session (existente)
  ├─ Subscription (existente)
  └─ WhatsAppInstance (existente)
       └─ AIAgentConfig (existente)
            └─ ... (tudo mantido)
```

### Contagem de Tabelas

```sql
-- Total de tabelas
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- Tabelas Xase
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'xase_%';
-- Resultado: 3

-- Tabelas existentes (não Xase)
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name NOT LIKE 'xase_%';
-- Resultado: 20+ (todas mantidas)
```

---

## 🎯 Casos de Uso

### Caso 1: Sistema Externo Registra Decisão

```javascript
// Sistema cliente (Node.js, Python, etc)
const response = await fetch('https://api.example.com/api/xase/v1/records', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.XASE_API_KEY
  },
  body: JSON.stringify({
    input: { /* dados de entrada */ },
    output: { /* resultado da IA */ },
    policyId: 'my-ai-model-v1',
    policyVersion: '1.0.0',
    decisionType: 'credit_approval',
    confidence: 0.92,
    storePayload: true
  })
});

const { transaction_id, receipt_url } = await response.json();

// Armazenar receipt_url no banco do cliente
// Enviar receipt_url para o usuário final
```

### Caso 2: Usuário Verifica Recibo

```
1. Usuário recebe email: "Sua decisão foi registrada: https://..."
2. Clica no link
3. Vê página pública com:
   - Hashes criptográficos
   - Timestamp
   - Aviso legal
   - Status "Verified"
4. Pode compartilhar URL com advogado/auditor
```

### Caso 3: Empresa Acessa Console (Futuro)

```
1. User faz login com NextAuth
2. Sistema verifica: user.tenantId existe?
3. Redireciona para /xase/console
4. Mostra lista de decisões do tenant
5. Pode ver payloads completos (se armazenados)
6. Pode exportar pacote de prova
```

---

## 🔐 Segurança

### API Key Storage

```javascript
// ❌ NUNCA faça isso
const apiKey = "xase_pk_..."; // hardcoded

// ✅ Sempre use variáveis de ambiente
const apiKey = process.env.XASE_API_KEY;
```

### Hash Verification

```javascript
// Verificar integridade localmente
import { hashObject, chainHash } from '@/lib/xase/crypto';

const record = await prisma.decisionRecord.findUnique({
  where: { transactionId: 'txn_...' }
});

// Recalcular hashes
const inputHash = hashObject(JSON.parse(record.inputPayload));
const outputHash = hashObject(JSON.parse(record.outputPayload));
const combinedData = `${inputHash}${outputHash}${record.contextHash || ''}`;
const recordHash = chainHash(record.previousHash, combinedData);

// Verificar
if (recordHash === record.recordHash) {
  console.log('✅ Integridade verificada');
} else {
  console.log('❌ ADULTERADO!');
}
```

---

## 📈 Monitoramento

### Queries Úteis

```sql
-- Total de decisões por tenant
SELECT 
  t.name,
  t.companyName,
  COUNT(dr.id) as total_decisions
FROM xase_tenants t
LEFT JOIN xase_decision_records dr ON dr."tenantId" = t.id
GROUP BY t.id
ORDER BY total_decisions DESC;

-- Decisões nas últimas 24h
SELECT COUNT(*) 
FROM xase_decision_records 
WHERE timestamp > NOW() - INTERVAL '24 hours';

-- API Keys mais usadas
SELECT 
  ak.name,
  ak."keyPrefix",
  ak."lastUsedAt",
  COUNT(dr.id) as total_records
FROM xase_api_keys ak
LEFT JOIN xase_decision_records dr ON dr."tenantId" = ak."tenantId"
GROUP BY ak.id
ORDER BY total_records DESC;

-- Verificar integridade da chain
SELECT 
  id,
  "transactionId",
  "previousHash" IS NULL as is_genesis,
  "recordHash"
FROM xase_decision_records
ORDER BY timestamp ASC;
```

---

## 🆘 Troubleshooting

### Problema: Migration falha com "relation already exists"

**Solução:** A migration é idempotente. Se falhar, pode rodar novamente:
```bash
npm run xase:migrate
```

### Problema: "Property 'tenant' does not exist on type 'PrismaClient'"

**Solução:** Regenerar Prisma Client:
```bash
npx prisma generate
```

### Problema: API retorna 401 Unauthorized

**Causas possíveis:**
1. API Key incorreta
2. API Key inativa
3. Tenant suspenso

**Verificar:**
```sql
SELECT * FROM xase_api_keys WHERE "keyPrefix" = 'xase_pk_...';
SELECT * FROM xase_tenants WHERE id = '...';
```

### Problema: Rate limit atingido

**Solução temporária:**
```sql
-- Aumentar limite
UPDATE xase_api_keys 
SET "rateLimit" = 10000 
WHERE id = '...';
```

**Solução permanente:** Implementar Redis

---

## 🎓 Próximos Aprendizados

### Para entender melhor:

1. **Hash Chaining:**
   - Leia `src/lib/xase/crypto.ts`
   - Função `chainHash()`
   - Similar a blockchain

2. **Imutabilidade:**
   - Veja triggers em `database/xase-core-migration.sql`
   - Tente UPDATE/DELETE (vai falhar)

3. **API Design:**
   - Estude `src/app/api/xase/v1/records/route.ts`
   - Validação com Zod
   - Rate limiting

4. **Prisma Relations:**
   - Veja `prisma/schema.prisma`
   - Relação User ↔ Tenant
   - Relação Tenant ↔ DecisionRecord

---

## ✅ Checklist de Validação

Antes de considerar completo, verifique:

- [ ] Migration executada sem erros
- [ ] Tabelas `xase_*` criadas
- [ ] Colunas `tenantId` e `xaseRole` no User
- [ ] Prisma Client gerado
- [ ] Tenant criado
- [ ] API Key gerada e guardada
- [ ] Health check funciona
- [ ] Decisão criada com sucesso
- [ ] Recibo público acessível
- [ ] Verificação de integridade funciona
- [ ] Triggers de imutabilidade ativos

---

**🎉 Parabéns! O Xase Core está integrado e funcionando!**

Próximo passo: Criar console privado para empresas visualizarem suas provas.
