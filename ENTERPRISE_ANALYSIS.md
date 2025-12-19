# 🔬 Análise Profunda do Sistema Xase Core

## 📊 Estado Atual (O que temos)

### ✅ Fundação Sólida
- **Hash chain funcional**: SHA-256 com `previousHash` → `recordHash`
- **Imutabilidade DB**: triggers SQL bloqueiam UPDATE/DELETE
- **API Key auth**: bcrypt hash + validação
- **Rate limiting**: básico (count por hora)
- **Canonical JSON**: ordenação de chaves para hash consistente
- **Receipt público**: `/xase/receipt/:id` com hashes visíveis
- **Verify endpoint**: recalcula hashes e valida chain

### 🗄️ Schema Atual
```prisma
Tenant {
  id, name, email, status, plan
  → apiKeys[]
  → decisionRecords[]
  → users[] (via User.tenantId)
}

ApiKey {
  id, tenantId, keyHash, keyPrefix
  isActive, rateLimit, lastUsedAt
}

DecisionRecord {
  id, tenantId, transactionId
  inputHash, outputHash, contextHash
  recordHash, previousHash
  policyId, policyVersion, decisionType
  confidence, processingTime
  inputPayload?, outputPayload?, contextPayload? (TEXT)
  storageUrl? (S3/R2 - não implementado)
  timestamp, createdAt
}

User {
  tenantId?, xaseRole? (OWNER/ADMIN/VIEWER)
}
```

### 🔐 Crypto Stack
- **Hashing**: SHA-256 via Node crypto
- **Chain**: `recordHash = SHA256(previousHash + inputHash + outputHash + contextHash?)`
- **API Key**: bcrypt (salt 10)
- **HMAC**: implementado mas não usado (generateHMAC/verifyHMAC)

### 🌐 APIs Implementadas
- `POST /api/xase/v1/records` → cria decisão
- `GET /api/xase/v1/records` → health check
- `GET /api/xase/v1/verify/:id` → verifica integridade
- `GET /xase/receipt/:id` → recibo público HTML

### 🚧 Infraestrutura
- **DB**: PostgreSQL (via Prisma)
- **Auth**: NextAuth (JWT)
- **Deps disponíveis**: redis (instalado mas não usado), pg, bcryptjs, zod
- **Env**: Next.js 15, App Router

---

## ❌ Gaps Críticos (O que falta)

### 1️⃣ EVIDÊNCIA "LEGAL-GRADE"

#### Gap A: Âncora Externa
**Problema**: Hash chain é interno; admin pode reescrever DB e recalcular chain.
**Impacto**: Empresa não confia que "vocês não mexeram".
**Solução**:
- **Checkpoint diário/horário**: Merkle root ou último recordHash
- **Assinatura KMS/HSM**: assinar checkpoint com chave privada
- **TSA (RFC3161)**: carimbo de tempo externo (ex: Digicert, Sectigo)
- **Opcional**: anchor em blockchain público (Ethereum, Bitcoin via OpenTimestamps)

**Implementação**:
```typescript
// Novo modelo
CheckpointRecord {
  id, tenantId, checkpointHash
  lastRecordHash, recordCount
  signature (KMS), tsaToken (RFC3161)
  timestamp, createdAt
}

// Cron job (a cada 1h ou 1 dia)
- Buscar último recordHash do tenant
- Calcular Merkle root (se múltiplos tenants)
- Assinar com KMS (AWS KMS, GCP KMS, Azure Key Vault)
- Obter TSA timestamp
- Persistir CheckpointRecord
```

#### Gap B: Proof Bundle Exportável
**Problema**: Verify endpoint é online; falta pacote offline.
**Impacto**: Perito/advogado não consegue validar sem acesso ao sistema.
**Solução**:
```json
// proof-bundle.zip
{
  "manifest.json": {
    "transaction_id": "txn_xxx",
    "record_hash": "abc...",
    "input_hash": "def...",
    "chain": [...],
    "checkpoint": {
      "signature": "...",
      "tsa_token": "..."
    }
  },
  "payloads/": { "input.json", "output.json" },
  "signatures/": { "kms.sig", "tsa.tsr" },
  "verification-script.js": "// valida offline"
}
```

#### Gap C: Modelo de Ameaças Documentado
**Problema**: Não está claro o que resistimos.
**Solução**: Documento técnico:
- ✅ Resiste: tamper de payload, replay, fork por tenant
- ❌ Não resiste (ainda): DB restore malicioso + recalc, admin root
- 🔄 Mitigação: checkpoint + TSA + auditoria WORM

---

### 2️⃣ SEGURANÇA

#### Gap A: Autenticação Forte
**Problema**: API Key crua no header; sem anti-replay.
**Solução**:
- **mTLS**: certificado cliente (comum em B2B)
- **HMAC request signing**: `Authorization: XASE-HMAC-SHA256 Credential=..., Signature=...`
- **JWT signed**: client credentials OAuth2

**Implementação mTLS**:
```typescript
// next.config.js
experimental: {
  serverActions: {
    bodySizeLimit: '2mb',
  },
  // mTLS via reverse proxy (nginx/cloudflare)
}

// Middleware valida cert
const clientCert = request.headers.get('x-client-cert');
if (!clientCert || !verifyCert(clientCert)) {
  return 401;
}
```

#### Gap B: Auditoria WORM de Ops
**Problema**: Sem trilha de ações admin (key rotation, export, acesso payload).
**Solução**:
```prisma
AuditLog {
  id, tenantId, userId, action
  resourceType, resourceId
  metadata (JSON), ipAddress
  timestamp (IMMUTABLE via trigger)
}
```

#### Gap C: Gestão de Chaves
**Problema**: Sem rotação automatizada, sem KMS.
**Solução**:
- **KMS**: AWS KMS, GCP KMS, Azure Key Vault
- **Rotação**: script mensal + grace period
- **Revogação**: flag `isRevoked` + auditoria

#### Gap D: Multi-tenant Hardening
**Problema**: Sem RLS; queries podem vazar entre tenants.
**Solução**:
```sql
-- RLS no Postgres
ALTER TABLE xase_decision_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON xase_decision_records
  USING (tenantId = current_setting('app.current_tenant_id')::text);
```

---

### 3️⃣ OPERAÇÃO

#### Gap A: SLOs e Resiliência
**Problema**: Sem fila, sem idempotência formal, sem backpressure.
**Solução**:
- **Fila**: Redis Bull/BullMQ para ingestão assíncrona
- **Idempotência**: `Idempotency-Key` header + cache 24h
- **SLO**: 99.9% uptime, p99 < 500ms

**Implementação**:
```typescript
// src/lib/xase/queue.ts
import { Queue } from 'bullmq';

const decisionQueue = new Queue('xase-decisions', {
  connection: { host: 'redis', port: 6379 }
});

// POST /records → enqueue
await decisionQueue.add('ingest', { tenantId, data });

// Worker processa
worker.on('completed', async (job) => {
  await persistDecision(job.data);
});
```

#### Gap B: Backups e Drills
**Problema**: Sem backup automatizado, sem teste de restore.
**Solução**:
- **Backup**: pg_dump diário → S3 com retenção 90d
- **Drill**: mensal, restaurar em staging e validar chain
- **RPO/RTO**: 1h / 4h

#### Gap C: Observabilidade
**Problema**: Logs básicos, sem métricas, sem tracing.
**Solução**:
```typescript
// src/lib/xase/telemetry.ts
import { trace, metrics } from '@opentelemetry/api';

const tracer = trace.getTracer('xase-core');
const meter = metrics.getMeter('xase-core');

const ingestCounter = meter.createCounter('xase.ingest.count');
const ingestLatency = meter.createHistogram('xase.ingest.latency');

// No endpoint
const span = tracer.startSpan('POST /records');
const start = Date.now();
try {
  // ... lógica
  ingestCounter.add(1, { tenant: tenantId });
} finally {
  ingestLatency.record(Date.now() - start);
  span.end();
}
```

#### Gap D: Runbooks
**Problema**: Sem playbooks de incidente.
**Solução**: Docs em `/docs/runbooks/`:
- `key-leaked.md`
- `tamper-detected.md`
- `db-corruption.md`
- `outage.md`

---

### 4️⃣ GOVERNANÇA

#### Gap A: Retenção e Purge
**Problema**: Sem política de retenção, sem purge controlado.
**Solução**:
```prisma
RetentionPolicy {
  id, tenantId, decisionType
  retentionDays, purgePayload, keepHashes
}

// Cron job
- Buscar records > retentionDays
- Se purgePayload: apagar *Payload, manter hashes
- Se keepHashes: manter record com hashes
- Logar em AuditLog
```

#### Gap B: PII Minimization
**Problema**: `storePayload` é escolha do cliente; sem classificação.
**Solução**:
```typescript
// src/lib/xase/pii.ts
export function redactPII(obj: any): any {
  // Detectar campos sensíveis (email, cpf, phone)
  // Substituir por hash ou token
}

// No POST /records
if (data.storePayload && containsPII(data.input)) {
  data.input = redactPII(data.input);
}
```

#### Gap C: DSR (LGPD/GDPR)
**Problema**: Sem fluxo de "direito ao esquecimento" sem quebrar prova.
**Solução**:
```typescript
// DELETE /api/xase/v1/records/:id/payload
- Apagar inputPayload, outputPayload, contextPayload
- Manter hashes + metadata
- Adicionar flag `payloadDeleted: true, deletedReason: 'DSR'`
- Logar em AuditLog
```

---

### 5️⃣ PRODUTO

#### Gap A: Console de Exploração
**Problema**: Sem UI para buscar/filtrar/exportar.
**Solução**:
```
/xase/console
  ├─ /dashboard (métricas)
  ├─ /records (listagem + filtros)
  ├─ /records/:id (detalhes + export)
  ├─ /api-keys (gestão)
  └─ /settings (retenção, webhooks)
```

#### Gap B: SDKs
**Problema**: Cliente precisa implementar hash canonical, retry, etc.
**Solução**:
```typescript
// @xase/sdk-node
import { XaseClient } from '@xase/sdk-node';

const xase = new XaseClient({ apiKey: 'xase_pk_...' });

await xase.recordDecision({
  input: { user: 123 },
  output: { approved: true },
  storePayload: false,
});

// SDK faz:
// - Canonical JSON hash
// - Retry com backoff
// - Batch opcional
// - Telemetria
```

#### Gap C: Export Formats
**Problema**: Sem formato padronizado para e-discovery.
**Solução**:
```json
// export-case-123.zip
{
  "manifest.json": {
    "case_id": "123",
    "records": [...],
    "format": "xase-v1",
    "exported_at": "2025-01-01T00:00:00Z"
  },
  "records/": { "txn_xxx.json", ... },
  "signatures/": { "manifest.sig" }
}
```

---

## 🎯 Plano de Implementação (30 dias)

### Semana 1-2: Evidência (Prioridade MÁXIMA)

#### Dia 1-3: Checkpoint + KMS Signing
```typescript
// 1. Adicionar modelo CheckpointRecord ao schema
// 2. Implementar src/lib/xase/checkpoint.ts
// 3. Integrar AWS KMS (ou mock local)
// 4. Cron job: checkpoint a cada 1h
// 5. Incluir checkpoint no verify endpoint
```

**Entregáveis**:
- `CheckpointRecord` no schema
- `/api/xase/v1/checkpoints` (listar)
- Assinatura KMS em cada checkpoint
- Verify mostra último checkpoint válido

#### Dia 4-7: Proof Bundle Export
```typescript
// 1. Implementar src/lib/xase/export.ts
// 2. POST /api/xase/v1/records/:id/export
// 3. Gerar ZIP com manifest + payloads + sigs
// 4. Script de verificação offline (Node.js)
```

**Entregáveis**:
- Export ZIP funcional
- `verify-offline.js` script
- Docs de como usar

---

### Semana 2-3: Segurança + Operação

#### Dia 8-10: Redis Rate Limit + Idempotency
```typescript
// 1. Implementar src/lib/xase/rate-limit-redis.ts
// 2. Sliding window com Redis
// 3. Idempotency-Key header + cache 24h
// 4. Quotas por tenant
```

#### Dia 11-14: Logs Estruturados + Métricas
```typescript
// 1. Implementar src/lib/xase/telemetry.ts
// 2. OpenTelemetry setup
// 3. Logs JSON com reqId, tenantId, latency
// 4. Métricas: ingest/min, verify errors, tamper rate
// 5. Exportar para Prometheus/Grafana
```

**Entregáveis**:
- Rate limit Redis funcional
- Idempotency implementada
- Logs estruturados em todas as APIs
- Dashboard Grafana básico

---

### Semana 3-4: Produto

#### Dia 15-18: Audit Log WORM
```typescript
// 1. Adicionar modelo AuditLog ao schema
// 2. Trigger SQL de imutabilidade
// 3. Logar: key rotation, export, payload access
// 4. Endpoint GET /api/xase/v1/audit-logs
```

#### Dia 19-21: Console Básico
```typescript
// 1. src/app/xase/console/page.tsx
// 2. Listagem de records com filtros
// 3. Detalhes de record
// 4. Export button (chama /export)
```

#### Dia 22-25: SDK Node.js
```typescript
// 1. Criar pacote @xase/sdk-node
// 2. Canonical JSON helper
// 3. Retry com backoff
// 4. Batch opcional
// 5. Publicar no npm (ou privado)
```

#### Dia 26-30: Docs + Runbooks
```markdown
// 1. docs/threat-model.md
// 2. docs/runbooks/*.md
// 3. docs/api-reference.md
// 4. docs/sdk-guide.md
```

---

## 📋 Checklist Enterprise (Pass/Fail)

### Evidência
- [ ] Checkpoint com assinatura KMS
- [ ] TSA timestamp (opcional mas recomendado)
- [ ] Proof bundle exportável
- [ ] Verificação offline funcional
- [ ] Modelo de ameaças documentado

### Segurança
- [ ] mTLS ou HMAC signing
- [ ] Audit log WORM
- [ ] KMS para assinaturas
- [ ] Rotação de chaves automatizada
- [ ] RLS no Postgres

### Operação
- [ ] Fila Redis para ingestão
- [ ] Idempotency-Key
- [ ] SLO definido (99.9%)
- [ ] Backups automatizados
- [ ] Restore drill mensal
- [ ] Logs estruturados
- [ ] Métricas (Prometheus)
- [ ] Tracing (OpenTelemetry)

### Governança
- [ ] Retenção configurável
- [ ] Purge controlado
- [ ] PII redaction
- [ ] DSR (delete payload, keep hashes)
- [ ] Audit trail de DSR

### Produto
- [ ] Console web funcional
- [ ] SDK Node.js
- [ ] Export formats padronizados
- [ ] Runbooks de incidente
- [ ] Docs de API

---

## 🚀 Próximos Passos (AGORA)

Vou implementar na seguinte ordem:

1. **CheckpointRecord** (schema + migration)
2. **KMS signing** (AWS KMS mock local para dev)
3. **Checkpoint cron job** (a cada 1h)
4. **Proof bundle export** (ZIP com manifest)
5. **Redis rate limit** (sliding window)
6. **Logs estruturados** (JSON com reqId)
7. **AuditLog** (WORM)
8. **Console básico** (listagem + export)

Cada passo será:
- Schema/migration SQL
- Implementação TypeScript
- Testes básicos
- Docs inline

**Começando agora com CheckpointRecord...**
