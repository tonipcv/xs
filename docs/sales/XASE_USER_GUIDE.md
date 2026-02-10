# XASE – Guia Prático de Uso Completo

Última atualização: 17/12/2025

## Índice

1. [Setup Inicial](#setup-inicial)
2. [Ingestão de Decisões](#ingestão-de-decisões)
3. [Verificação de Integridade](#verificação-de-integridade)
4. [Export de Evidências](#export-de-evidências)
5. [Human-in-the-Loop (HITL)](#human-in-the-loop-hitl)
6. [Gerenciamento de Políticas](#gerenciamento-de-políticas)
7. [Console Administrativo](#console-administrativo)
8. [Troubleshooting](#troubleshooting)

---

## Setup Inicial

### 1. Criar Tenant

```bash
# Via script de setup
DATABASE_URL="postgres://..." node database/create-tenant.js
```

Ou via Prisma:

```typescript
import { prisma } from '@/lib/prisma'

const tenant = await prisma.tenant.create({
  data: {
    name: 'Minha Empresa',
    companyName: 'Minha Empresa LTDA',
    status: 'ACTIVE',
  },
})

console.log('Tenant ID:', tenant.id)
```

### 2. Criar API Key

Via console (`/xase/api-keys`) ou via API:

```bash
curl -X POST http://localhost:3000/api/xase/v1/api-keys \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "name": "Production Key",
    "permissions": "ingest,export,verify,intervene"
  }'
```

Response:

```json
{
  "api_key": "xase_pk_abc123...",
  "key_id": "key_xyz...",
  "permissions": ["ingest", "export", "verify", "intervene"]
}
```

**⚠️ Importante**: salve a API Key em local seguro. Ela não será exibida novamente.

### 3. Configurar Storage (Opcional)

Para habilitar export de bundles, configure MinIO ou S3:

```bash
# .env.local
MINIO_SERVER_URL="http://localhost:9000"
MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD="minioadmin"
BUCKET_NAME="xase"
```

Ou AWS S3:

```bash
# .env.local
S3_ENDPOINT="https://s3.us-east-1.amazonaws.com"
S3_REGION="us-east-1"
S3_ACCESS_KEY="..."
S3_SECRET_KEY="..."
S3_BUCKET="xase-prod"
```

### 4. Configurar KMS (Opcional)

Para produção, configure AWS KMS:

```bash
# .env.local
XASE_KMS_TYPE="aws"
XASE_KMS_KEY_ID="arn:aws:kms:us-east-1:123456789012:key/..."
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
```

Para desenvolvimento, use Mock KMS (padrão):

```bash
# .env.local
XASE_KMS_TYPE="mock"
```

---

## Ingestão de Decisões

### Exemplo 1: Decisão de Crédito (Básico)

```bash
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "X-API-Key: xase_pk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "customer_id": "cust_123",
      "requested_amount": 50000,
      "income": 10000,
      "credit_score": 750
    },
    "output": {
      "decision": "APPROVED",
      "approved_amount": 50000,
      "interest_rate": 2.5,
      "term_months": 36
    },
    "policyId": "credit-policy-v1",
    "decisionType": "credit_approval",
    "confidence": 0.95
  }'
```

Response:

```json
{
  "success": true,
  "transaction_id": "txn_074e4ced98a889b919737878717687e8",
  "receipt_url": "http://localhost:3000/xase/receipt/txn_074e4ced98a889b919737878717687e8",
  "timestamp": "2025-12-17T14:30:00.000Z",
  "record_hash": "a1b2c3d4e5f6...",
  "chain_position": "chained"
}
```

### Exemplo 2: Decisão com Payload Completo

```bash
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "X-API-Key: xase_pk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "customer_id": "cust_456",
      "requested_amount": 100000,
      "income": 15000,
      "credit_score": 680,
      "employment_years": 5,
      "debt_ratio": 0.3
    },
    "output": {
      "decision": "REJECTED",
      "reason": "High debt ratio",
      "recommended_amount": 50000
    },
    "context": {
      "model_version": "v2.1.0",
      "features_used": ["income", "credit_score", "debt_ratio"],
      "processing_time_ms": 45
    },
    "policyId": "credit-policy-v2",
    "policyVersion": "2.1.0",
    "decisionType": "credit_approval",
    "confidence": 0.88,
    "processingTime": 45,
    "storePayload": true,
    "modelId": "credit-model-v2",
    "modelVersion": "2.1.0",
    "modelHash": "sha256:abc123...",
    "featureSchemaHash": "sha256:def456..."
  }'
```

### Exemplo 3: Idempotência

```bash
# Primeira chamada
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "X-API-Key: xase_pk_abc123..." \
  -H "Idempotency-Key: unique-key-123" \
  -H "Content-Type: application/json" \
  -d '{ "input": {...}, "output": {...} }'

# Segunda chamada (mesmo Idempotency-Key)
curl -X POST http://localhost:3000/api/xase/v1/records \
  -H "X-API-Key: xase_pk_abc123..." \
  -H "Idempotency-Key: unique-key-123" \
  -H "Content-Type: application/json" \
  -d '{ "input": {...}, "output": {...} }'

# Response da segunda chamada:
# HTTP 201 Created
# X-Idempotency-Replay: true
# { "transaction_id": "txn_...", ... } (mesmo da primeira)
```

### Exemplo 4: Listar Decisões

```bash
curl http://localhost:3000/api/xase/v1/records?page=1&limit=20 \
  -H "X-API-Key: xase_pk_abc123..."
```

Response:

```json
{
  "records": [
    {
      "id": "rec_123",
      "transactionId": "txn_074e4ced98a889b919737878717687e8",
      "policyId": "credit-policy-v1",
      "decisionType": "credit_approval",
      "confidence": 0.95,
      "isVerified": true,
      "timestamp": "2025-12-17T14:30:00.000Z",
      "recordHash": "a1b2c3d4e5f6..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

## Verificação de Integridade

### Exemplo 1: Verificar Decisão

```bash
curl http://localhost:3000/api/xase/v1/verify/txn_074e4ced98a889b919737878717687e8
```

Response:

```json
{
  "transaction_id": "txn_074e4ced98a889b919737878717687e8",
  "is_valid": true,
  "status": "VERIFIED",
  "verification": {
    "input_hash": true,
    "output_hash": true,
    "context_hash": true,
    "chain_integrity": true,
    "payload_available": true
  },
  "metadata": {
    "timestamp": "2025-12-17T14:30:00.000Z",
    "policy_id": "credit-policy-v1",
    "decision_type": "credit_approval",
    "confidence": 0.95
  },
  "chain": {
    "previous_hash": "xyz789...",
    "record_hash": "a1b2c3d4e5f6...",
    "is_genesis": false,
    "has_next": true,
    "next_transaction_id": "txn_abc456..."
  },
  "checkpoint": {
    "checkpoint_id": "chk_123",
    "checkpoint_hash": "def456...",
    "signature": "base64...",
    "key_id": "arn:aws:kms:...",
    "timestamp": "2025-12-17T15:00:00.000Z"
  },
  "verified_at": "2025-12-17T16:00:00.000Z"
}
```

### Exemplo 2: Verificar Checkpoint

```typescript
import { verifyCheckpoint } from '@/lib/xase/checkpoint'

const result = await verifyCheckpoint('chk_123')

console.log('Is valid:', result.isValid)
console.log('Signature valid:', result.checks.signatureValid)
console.log('Hash valid:', result.checks.hashValid)
console.log('Chain valid:', result.checks.chainValid)
```

---

## Export de Evidências

### Exemplo 1: Export com Payloads (Stream)

```bash
curl http://localhost:3000/api/xase/v1/export/txn_074e4ced98a889b919737878717687e8/download?include_payloads=true \
  -H "X-API-Key: xase_pk_abc123..." \
  -o evidence.zip
```

### Exemplo 2: Export Hash-Only (Redirect)

```bash
curl "http://localhost:3000/api/xase/v1/export/txn_074e4ced98a889b919737878717687e8/download?include_payloads=false&download=redirect" \
  -H "X-API-Key: xase_pk_abc123..." \
  -L -o evidence_hashes.zip
```

### Exemplo 3: Export com Presigned URL (JSON)

```bash
curl "http://localhost:3000/api/xase/v1/export/txn_074e4ced98a889b919737878717687e8/download?download=json" \
  -H "X-API-Key: xase_pk_abc123..."
```

Response:

```json
{
  "bundle_id": "bundle_abc123...",
  "transaction_id": "txn_074e4ced98a889b919737878717687e8",
  "presigned_url": "https://s3.amazonaws.com/xase-prod/evidence/txn_...?X-Amz-Signature=...",
  "expires_in": 3600,
  "size": 45678,
  "hash": "sha256:def456...",
  "cached": false
}
```

### Exemplo 4: Verificar Bundle Offline

```bash
# Extrair bundle
unzip evidence.zip

# Verificar
node verify.js
```

Output:

```
✓ Hash match: true
✓ Signature valid: true
ℹ️ Key fingerprint: a1b2c3d4e5f6...
ℹ️ Verify this fingerprint matches official channel (website/docs)
```

---

## Human-in-the-Loop (HITL)

### Exemplo 1: Aprovar Decisão (API)

```bash
curl -X POST http://localhost:3000/api/xase/v1/records/txn_074e4ced98a889b919737878717687e8/intervene \
  -H "X-API-Key: xase_pk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "action": "APPROVED",
    "actorName": "João Silva",
    "actorEmail": "joao@empresa.com",
    "actorRole": "REVIEWER",
    "reason": "Decisão validada conforme política vigente",
    "notes": "Cliente possui histórico positivo"
  }'
```

Response:

```json
{
  "success": true,
  "intervention_id": "int_abc123...",
  "transaction_id": "txn_074e4ced98a889b919737878717687e8",
  "action": "APPROVED",
  "timestamp": "2025-12-17T15:00:00.000Z",
  "actor": {
    "name": "João Silva",
    "email": "joao@empresa.com"
  }
}
```

### Exemplo 2: Rejeitar Decisão (API)

```bash
curl -X POST http://localhost:3000/api/xase/v1/records/txn_074e4ced98a889b919737878717687e8/intervene \
  -H "X-API-Key: xase_pk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "action": "REJECTED",
    "actorName": "Maria Santos",
    "actorEmail": "maria@empresa.com",
    "actorRole": "ADMIN",
    "reason": "Cliente possui restrição não detectada pelo modelo",
    "notes": "Verificar base de dados de restrições manualmente"
  }'
```

### Exemplo 3: Override com Novo Resultado (API)

```bash
curl -X POST http://localhost:3000/api/xase/v1/records/txn_074e4ced98a889b919737878717687e8/intervene \
  -H "X-API-Key: xase_pk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "action": "OVERRIDE",
    "actorName": "Carlos Oliveira",
    "actorEmail": "carlos@empresa.com",
    "actorRole": "OWNER",
    "reason": "Cliente possui garantia adicional não considerada",
    "newOutcome": {
      "decision": "APPROVED",
      "approved_amount": 75000,
      "interest_rate": 2.0,
      "term_months": 48,
      "manual_override": true,
      "override_reason": "Garantia imobiliária adicional"
    },
    "metadata": {
      "guarantee_type": "real_estate",
      "guarantee_value": 500000
    }
  }'
```

### Exemplo 4: Listar Intervenções (API)

```bash
curl http://localhost:3000/api/xase/v1/records/txn_074e4ced98a889b919737878717687e8/intervene \
  -H "X-API-Key: xase_pk_abc123..."
```

Response:

```json
{
  "transaction_id": "txn_074e4ced98a889b919737878717687e8",
  "interventions": [
    {
      "id": "int_abc123...",
      "action": "OVERRIDE",
      "actor": {
        "userId": "user_123",
        "name": "Carlos Oliveira",
        "email": "carlos@empresa.com",
        "role": "OWNER"
      },
      "reason": "Cliente possui garantia adicional não considerada",
      "notes": null,
      "metadata": {
        "guarantee_type": "real_estate",
        "guarantee_value": 500000
      },
      "hasNewOutcome": true,
      "timestamp": "2025-12-17T15:30:00.000Z"
    }
  ],
  "total": 1
}
```

### Exemplo 5: Adicionar Intervenção via UI

1. Acesse `/xase/records/txn_074e4ced98a889b919737878717687e8`
2. Clique em "Add Intervention"
3. Selecione ação (APPROVED/REJECTED/OVERRIDE/ESCALATED)
4. Preencha justificativa (obrigatório para REJECTED/OVERRIDE)
5. Se OVERRIDE: preencha novo resultado (JSON)
6. Clique "Submit"
7. Toast de sucesso + lista atualizada

---

## Gerenciamento de Políticas

### Exemplo 1: Criar Política

```typescript
import { createPolicy } from '@/lib/xase/policies'

const policy = await createPolicy('tenant_123', {
  policyId: 'credit-policy-v2',
  version: '2.1.0',
  name: 'Política de Crédito v2.1',
  description: 'Política atualizada com novos thresholds',
  document: {
    rules: [
      {
        condition: 'credit_score >= 700',
        action: 'APPROVE',
        max_amount: 100000
      },
      {
        condition: 'credit_score >= 600 AND debt_ratio < 0.4',
        action: 'APPROVE',
        max_amount: 50000
      },
      {
        condition: 'credit_score < 600',
        action: 'REJECT'
      }
    ],
    thresholds: {
      min_credit_score: 600,
      max_debt_ratio: 0.4,
      min_income: 3000
    }
  }
})

console.log('Policy created:', policy.policyId, policy.version)
console.log('Document hash:', policy.documentHash)
```

### Exemplo 2: Buscar Política Ativa

```typescript
import { getActivePolicy } from '@/lib/xase/policies'

const policy = await getActivePolicy('tenant_123', 'credit-policy-v2')

if (policy) {
  console.log('Active version:', policy.version)
  console.log('Document:', policy.document)
  console.log('Hash:', policy.documentHash)
}
```

### Exemplo 3: Listar Versões de Política

```typescript
import { listPolicyVersions } from '@/lib/xase/policies'

const versions = await listPolicyVersions('tenant_123', 'credit-policy-v2')

versions.forEach(v => {
  console.log(`Version ${v.version}: ${v.isActive ? 'ACTIVE' : 'INACTIVE'}`)
  console.log(`  Activated at: ${v.activatedAt}`)
  console.log(`  Hash: ${v.documentHash}`)
})
```

---

## Console Administrativo

### Dashboard (`/xase`)

- **Stats**: total de records, checkpoints, exports, integrity status.
- **Quick actions**: view records, checkpoints, audit trail.
- **System status**: hash chain, last checkpoint, API status.

### Records (`/xase/records`)

- **Lista**: tabela com transactionId, policy, type, confidence, timestamp, status.
- **Filtros**: search (transactionId), policyId.
- **Ações**: "View Details" → `/xase/records/:id`.

### Record Details (`/xase/records/:id`)

- **Info**: transactionId, timestamp, policy, decision type, confidence.
- **Hashes**: inputHash, outputHash, contextHash, recordHash, previousHash.
- **Chain**: position, is_genesis, has_next, next_transaction_id.
- **Checkpoint**: checkpoint_id, timestamp, signature.
- **Human Interventions**: lista de intervenções + badge `finalDecisionSource`.
- **Actions**: "Download Full" (payloads), "Download Hashes", "Add Intervention".

### Checkpoints (`/xase/checkpoints`)

- **Stats**: total, signed, last checkpoint.
- **Config**: checkpoint automático, KMS provider, algoritmo.
- **Lista**: tabela com checkpoint #, checkpointId, records, algorithm, timestamp, status.

### Audit Log (`/xase/audit`)

- **Stats**: total, today, this week, WORM status.
- **Lista**: tabela com action, resourceType, resourceId, timestamp, status.

### API Keys (`/xase/api-keys`)

- **Lista**: tabela com name, permissions, lastUsedAt, status.
- **Ações**: "Create Key", "Revoke Key".

---

## Troubleshooting

### Erro: "Invalid API key format"

**Causa**: API Key não está no formato correto.

**Solução**: API Key deve começar com `xase_pk_` ou `xase_sk_` e ter 32+ caracteres.

```bash
# Correto
X-API-Key: xase_pk_abc123def456...

# Incorreto
X-API-Key: abc123
```

### Erro: "Rate limit exceeded"

**Causa**: API Key excedeu 1000 requests/hora.

**Solução**: aguarde 1 hora ou crie nova API Key.

```bash
# Response
HTTP 429 Too Many Requests
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1702828800000
```

### Erro: "newOutcome is required for OVERRIDE action"

**Causa**: ação OVERRIDE sem campo `newOutcome`.

**Solução**: inclua `newOutcome` no payload.

```bash
curl -X POST .../intervene \
  -d '{
    "action": "OVERRIDE",
    "reason": "...",
    "newOutcome": { "decision": "APPROVED", "amount": 50000 }
  }'
```

### Erro: "reason is required for REJECTED and OVERRIDE actions"

**Causa**: ação REJECTED ou OVERRIDE sem campo `reason`.

**Solução**: inclua `reason` no payload.

```bash
curl -X POST .../intervene \
  -d '{
    "action": "REJECTED",
    "reason": "Cliente possui restrição"
  }'
```

### Erro: "Insufficient role for intervention"

**Causa**: usuário não tem papel OWNER/ADMIN/REVIEWER.

**Solução**: atualizar papel do usuário no banco:

```sql
UPDATE "User" SET "xaseRole" = 'REVIEWER' WHERE email = 'user@empresa.com';
```

### Erro: "Storage not configured"

**Causa**: MinIO/S3 não configurado.

**Solução**: configurar variáveis de ambiente:

```bash
# .env.local
MINIO_SERVER_URL="http://localhost:9000"
MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD="minioadmin"
BUCKET_NAME="xase"
```

### Erro: "Verification failed: chain_integrity = false"

**Causa**: hash chain quebrado (possível adulteração).

**Solução**: investigar no audit log:

```bash
curl http://localhost:3000/api/xase/v1/audit?resourceType=DECISION_RECORD&action=RECORD_UPDATED
```

---

## Exemplos Avançados

### Exemplo 1: Batch Ingest com Idempotência

```typescript
import { randomUUID } from 'crypto'

const decisions = [
  { input: {...}, output: {...} },
  { input: {...}, output: {...} },
  { input: {...}, output: {...} },
]

for (const decision of decisions) {
  const idempotencyKey = randomUUID()
  
  await fetch('http://localhost:3000/api/xase/v1/records', {
    method: 'POST',
    headers: {
      'X-API-Key': 'xase_pk_abc123...',
      'Idempotency-Key': idempotencyKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(decision),
  })
}
```

### Exemplo 2: Export com Retry

```typescript
async function exportWithRetry(transactionId: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(
        `http://localhost:3000/api/xase/v1/export/${transactionId}/download?download=json`,
        {
          headers: { 'X-API-Key': 'xase_pk_abc123...' },
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        return data.presigned_url
      }
      
      if (response.status === 429) {
        // Rate limit: aguardar e tentar novamente
        await new Promise(resolve => setTimeout(resolve, 60000))
        continue
      }
      
      throw new Error(`Export failed: ${response.status}`)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}
```

### Exemplo 3: Webhook de Intervenção (Futuro)

```typescript
// Configurar webhook (futuro)
await fetch('http://localhost:3000/api/xase/v1/webhooks', {
  method: 'POST',
  headers: {
    'X-API-Key': 'xase_pk_abc123...',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://meu-sistema.com/webhooks/xase',
    events: ['intervention.created', 'intervention.failed'],
    secret: 'webhook_secret_123',
  }),
})

// Receber webhook
app.post('/webhooks/xase', (req, res) => {
  const signature = req.headers['x-xase-signature']
  const payload = req.body
  
  // Verificar HMAC
  const expectedSignature = crypto
    .createHmac('sha256', 'webhook_secret_123')
    .update(JSON.stringify(payload))
    .digest('hex')
  
  if (signature !== expectedSignature) {
    return res.status(401).send('Invalid signature')
  }
  
  // Processar evento
  if (payload.event === 'intervention.created') {
    console.log('Intervention created:', payload.data.intervention_id)
    // Enviar notificação, atualizar sistema, etc.
  }
  
  res.status(200).send('OK')
})
```

---

## Checklist de Produção

### Antes de ir para produção

- [ ] Configurar AWS KMS (não usar Mock KMS).
- [ ] Configurar S3 ou MinIO com backup.
- [ ] Configurar variáveis de ambiente de produção.
- [ ] Criar API Keys de produção com permissões mínimas.
- [ ] Configurar rate limiting adequado (Redis).
- [ ] Configurar monitoring (Sentry, DataDog).
- [ ] Configurar alertas de falha de checkpoint.
- [ ] Configurar backup de banco de dados.
- [ ] Testar export de evidências end-to-end.
- [ ] Testar HITL com todos os papéis (OWNER/ADMIN/REVIEWER/VIEWER).
- [ ] Documentar processo de DSR (Data Subject Request).
- [ ] Treinar time de suporte.

---

## Referências

- **Docs técnicos**: `docs/XASE_TECHNICAL_OVERVIEW.md`
- **Proposta de vendas**: `docs/XASE_SALES_COMPLETE.md`
- **Status HITL**: `docs/SYSTEM_STATUS_HITL.md`, `docs/SYSTEM_STATUS_HITL_SALES.md`
- **Código**: `src/lib/xase/*.ts`, `src/app/api/xase/v1/**/*.ts`

---

**Última atualização**: 17 de dezembro de 2025  
**Versão**: 1.0.0  
**Status**: Production-ready
