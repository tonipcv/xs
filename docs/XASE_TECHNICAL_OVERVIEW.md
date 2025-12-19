# XASE – Visão Técnica Completa do Sistema

Última atualização: 17/12/2025

## Índice

1. [Arquitetura Geral](#arquitetura-geral)
2. [Produtos e Módulos](#produtos-e-módulos)
3. [Fluxos Técnicos Detalhados](#fluxos-técnicos-detalhados)
4. [APIs REST (Referência Completa)](#apis-rest-referência-completa)
5. [Biblioteca Core](#biblioteca-core)
6. [Console Administrativo](#console-administrativo)
7. [Segurança e Compliance](#segurança-e-compliance)
8. [Infraestrutura e Dependências](#infraestrutura-e-dependências)

---

## Arquitetura Geral

XASE é um **ledger imutável para decisões de IA** com prova criptográfica, auditoria completa e export forense. Construído em Next.js 14 (App Router), Prisma ORM, PostgreSQL e MinIO/S3.

### Pilares técnicos

- **Imutabilidade WORM**: triggers SQL impedem UPDATE/DELETE em tabelas críticas.
- **Hash chain**: cada record encadeia o anterior via `previousHash → recordHash`.
- **Checkpoints KMS**: âncoras externas assinadas periodicamente.
- **Export forense**: bundles ZIP com `decision.json`, `proof.json`, `verify.js` e assinatura RSA-SHA256.
- **Human-in-the-Loop (HITL)**: registro de intervenções humanas (approve/reject/override/escalate).
- **Auditoria**: `AuditLog` WORM para todas as ações administrativas.
- **Policies**: versionamento de políticas com snapshot imutável.

### Stack

- **Frontend**: Next.js 14 (App Router), React, TailwindCSS.
- **Backend**: Next.js API Routes, Prisma ORM, PostgreSQL.
- **Storage**: MinIO (S3-compatible) para bundles.
- **KMS**: Mock (dev) ou AWS KMS (prod) para assinaturas.
- **Auth**: Next-Auth (sessão) + API Keys (bcrypt).

---

## Produtos e Módulos

### 1. Decision Ledger (Ingest + Verify)

**O que faz**: registra decisões de IA em ledger imutável com hash chain.

**Componentes**:
- `POST /api/xase/v1/records` – ingestão de decisão.
- `GET /api/xase/v1/records` – listagem paginada.
- `GET /api/xase/v1/verify/:id` – verificação criptográfica.
- `src/lib/xase/crypto.ts` – hashing (SHA-256), chain, transaction ID.
- `src/lib/xase/idempotency.ts` – dedupe via `Idempotency-Key`.

**Fluxo de ingestão**:
1. Cliente envia `{ input, output, context, policyId, confidence }`.
2. API valida API Key + permissão `ingest` + rate limit.
3. Calcula `inputHash`, `outputHash`, `contextHash`.
4. Busca último record do tenant → `previousHash`.
5. Calcula `recordHash = chainHash(previousHash, combinedData)`.
6. Persiste `DecisionRecord` com hashes e encadeamento.
7. Retorna `transaction_id` + `receipt_url`.

**Campos do DecisionRecord**:
- `transactionId` (público, único).
- `inputHash`, `outputHash`, `contextHash`, `recordHash`, `previousHash`.
- `policyId`, `policyVersion`, `decisionType`, `confidence`, `processingTime`.
- `inputPayload`, `outputPayload`, `contextPayload` (opcional, se `storePayload: true`).
- `hasHumanIntervention`, `finalDecisionSource` (campos derivados HITL).

**Verificação**:
- Recalcula hashes dos payloads (se disponíveis).
- Recalcula `recordHash` e compara.
- Verifica encadeamento com `previousHash`.
- Retorna `is_valid`, `status`, `verification`, `chain`, `checkpoint`.

---

### 2. Checkpoints (Integrity Anchors)

**O que faz**: cria âncoras periódicas assinadas por KMS para provar integridade do ledger em um ponto no tempo.

**Componentes**:
- `src/lib/xase/checkpoint.ts` – `createCheckpoint()`, `verifyCheckpoint()`.
- `POST /api/xase/v1/cron/checkpoint` – cron job (executa a cada 1h).
- `src/app/xase/checkpoints/page.tsx` – UI de visualização.

**Fluxo de criação**:
1. Busca último checkpoint do tenant → `previousCheckpointHash`.
2. Busca último record → `lastRecordHash`.
3. Conta records desde último checkpoint → `recordCount`.
4. Calcula `checkpointHash = SHA256(previousCheckpointHash | lastRecordHash | recordCount | timestamp)`.
5. Assina `checkpointHash` com KMS → `signature`.
6. Persiste `CheckpointRecord` com `checkpointNumber` (monotônico).
7. Log de auditoria.

**Campos do CheckpointRecord**:
- `checkpointId`, `checkpointNumber`, `checkpointType` (PERIODIC/MANUAL/EMERGENCY).
- `lastRecordHash`, `recordCount`, `checkpointHash`.
- `signature`, `signatureAlgo`, `keyId`.
- `previousCheckpointId` (encadeamento).
- `isVerified`, `verifiedAt`.

**Verificação**:
- Recalcula `checkpointHash`.
- Verifica assinatura KMS.
- Verifica encadeamento com checkpoint anterior.

---

### 3. Export Forense (Evidence Bundles)

**O que faz**: gera bundles ZIP verificáveis offline com decisão, prova criptográfica e script de verificação.

**Componentes**:
- `src/lib/xase/export.ts` – `generateProofBundle()`.
- `GET /api/xase/v1/export/:id/download` – download de bundle.
- `src/lib/xase/storage.ts` – upload para MinIO/S3.
- `src/lib/xase/signing-service.ts` – assinatura enterprise.

**Fluxo de export**:
1. Busca `DecisionRecord` + checkpoint mais próximo.
2. Monta `manifest.json` com hashes, chain, checkpoint.
3. Inclui payloads se `includePayloads=true`.
4. Busca policy snapshot (se `policyId` presente).
5. Monta `decision.json` com input/output/context/policy/model.
6. Canonicaliza JSON (JCS) e calcula `decisionHash`.
7. Assina `decisionHash` via `signHash()` (rate limit + validação).
8. Monta `proof.json` com signature, keyId, publicKeyPem.
9. Gera `verify.js` (script Node.js offline).
10. Monta `report.txt` (human-readable).
11. Cria ZIP com jszip.
12. Upload para storage (se configurado) → URL assinado.
13. Persiste `EvidenceBundle` no DB.
14. Retorna ZIP (stream) ou presigned URL (redirect/json).

**Estrutura do bundle**:
```
evidence_txn_abc.zip
├── decision.json       # Decisão completa (input/output/context/policy/model)
├── proof.json          # Assinatura + chave pública + metadata
├── verify.js           # Script de verificação offline
├── report.txt          # Relatório human-readable
├── policy.json         # Snapshot da política (se disponível)
├── explanation.json    # Explicabilidade (SHAP, etc) se presente
└── payloads/           # Payloads completos (se includePayloads=true)
    ├── input.json
    ├── output.json
    └── context.json
```

**Campos do EvidenceBundle**:
- `bundleId`, `transactionId`, `storageUrl`, `storageKey`.
- `bundleHash`, `bundleSize`, `format` (zip).
- `includesPdf`, `includesPayloads`.

---

### 4. Human-in-the-Loop (HITL)

**O que faz**: registra intervenções humanas em decisões de IA (approve/reject/override/escalate).

**Componentes**:
- `src/lib/xase/human-intervention.ts` – `createIntervention()`, `getInterventions()`.
- `POST /api/xase/v1/records/:id/intervene` – API pública (API Key).
- `POST /api/records/:id/intervene` – API UI (sessão).
- `src/components/xase/InterventionDialog.tsx` – modal de intervenção.
- `src/components/xase/RecordDetails.tsx` – lista de intervenções.

**Tipos de ação**:
- `REVIEW_REQUESTED` – marca para revisão.
- `APPROVED` – aprova decisão da IA.
- `REJECTED` – rejeita decisão da IA.
- `OVERRIDE` – altera resultado (exige `newOutcome`).
- `ESCALATED` – escala para nível superior.

**Fluxo de criação**:
1. Valida que record existe e pertence ao tenant.
2. Valida ação: `OVERRIDE` exige `newOutcome`; `REJECTED/OVERRIDE` exigem `reason`.
3. Captura snapshot do `outputPayload` anterior (para OVERRIDE).
4. Cria `HumanIntervention` com ator (nome, email, papel, IP, UA).
5. Atualiza `DecisionRecord.hasHumanIntervention = true`.
6. Atualiza `DecisionRecord.finalDecisionSource` (AI → HUMAN_APPROVED/REJECTED/OVERRIDE).
7. Registra em `AuditLog`.

**Campos do HumanIntervention**:
- `action`, `actorUserId`, `actorName`, `actorEmail`, `actorRole`.
- `reason`, `notes`, `metadata` (JSON).
- `newOutcome`, `previousOutcome` (JSON).
- `ipAddress`, `userAgent`, `timestamp`.

**RBAC**:
- **UI (sessão)**: POST permitido para `OWNER|ADMIN|REVIEWER`; GET para `VIEWER+`.
- **API pública**: permissão `ingest` (recomendado separar `intervene`).

---

### 5. Policies (Versionamento)

**O que faz**: versiona políticas de decisão com snapshot imutável.

**Componentes**:
- `src/lib/xase/policies.ts` – `createPolicy()`, `getActivePolicy()`, `getPolicyVersion()`.
- Integração com ingest: resolve snapshot ativo e persiste `policyVersion` + `policyHash`.

**Fluxo**:
1. Cliente cria política via `createPolicy(tenantId, { policyId, version, document })`.
2. Calcula `documentHash = SHA256(JSON.stringify(document))`.
3. Desativa versões anteriores (`isActive = false`).
4. Persiste nova versão com `isActive = true`.
5. Ingest resolve snapshot ativo e persiste referência imutável.

**Campos do Policy**:
- `policyId`, `version`, `document` (JSON), `documentHash`.
- `name`, `description`, `isActive`, `activatedAt`, `deactivatedAt`.

---

### 6. Audit Log (Trilha Imutável)

**O que faz**: registra todas as ações administrativas em trilha WORM.

**Componentes**:
- `src/lib/xase/audit.ts` – `logAudit()`, `queryAuditLogs()`.
- `src/app/xase/audit/page.tsx` – UI de visualização.

**Ações comuns**:
- `KEY_CREATED`, `KEY_ROTATED`, `KEY_REVOKED`.
- `CHECKPOINT_CREATED`, `CHECKPOINT_VERIFIED`.
- `EXPORT_CREATED`, `BUNDLE_STORED`, `BUNDLE_DOWNLOADED`.
- `HUMAN_APPROVED`, `HUMAN_REJECTED`, `HUMAN_OVERRIDE`, `INTERVENTION_FAILED`.
- `POLICY_CREATED`, `POLICY_DEACTIVATED`.

**Campos do AuditLog**:
- `tenantId`, `userId`, `action`, `resourceType`, `resourceId`.
- `metadata` (JSON), `ipAddress`, `userAgent`.
- `status` (SUCCESS/FAILED/DENIED), `errorMessage`, `timestamp`.

---

### 7. API Keys (Autenticação)

**O que faz**: gerencia API Keys com bcrypt, permissões e rate limit.

**Componentes**:
- `src/lib/xase/auth.ts` – `validateApiKey()`, `hasPermission()`, `checkRateLimit()`.
- `POST /api/xase/v1/api-keys` – criar key.
- `GET /api/xase/v1/api-keys` – listar keys.
- `DELETE /api/xase/v1/api-keys/:id` – revogar key.

**Fluxo de validação**:
1. Extrai `X-API-Key` do header.
2. Valida formato (`xase_pk_...` ou `xase_sk_...`).
3. Busca todas keys ativas do sistema.
4. Compara com bcrypt (protegido contra timing attacks).
5. Verifica tenant ativo.
6. Atualiza `lastUsedAt` (fire-and-forget).
7. Retorna `{ valid, tenantId, apiKeyId, permissions }`.

**Permissões**:
- `ingest` – criar records.
- `export` – exportar bundles.
- `verify` – verificar records.
- `intervene` – criar intervenções (recomendado separar de `ingest`).

**Rate limit**:
- 1000 requests/hora por API Key (in-memory; produção: Redis).

---

### 8. Signing Service (Enterprise)

**O que faz**: camada de segurança entre API e KMS com validação e rate limit.

**Componentes**:
- `src/lib/xase/signing-service.ts` – `signHash()`, `verifySignature()`, `getPublicKeyPem()`.
- `src/lib/xase/kms.ts` – provider abstrato (Mock ou AWS KMS).

**Fluxo de assinatura**:
1. Valida request: hash SHA-256 (64 hex chars), tenantId, resourceType, resourceId.
2. Rate limit: 1000 assinaturas/hora por tenant.
3. Assina hash com KMS (nunca assina JSON direto).
4. Calcula fingerprint da chave pública.
5. Registra em `AuditLog`.
6. Retorna `{ signature, algorithm, keyId, keyFingerprint, timestamp }`.

**KMS Providers**:
- **Mock** (dev): gera par RSA in-memory.
- **AWS KMS** (prod): usa `@aws-sdk/client-kms`.

---

## Fluxos Técnicos Detalhados

### Fluxo 1: Ingest de Decisão

```
Cliente → POST /api/xase/v1/records
  ↓
1. validateApiKey(request) → { valid, tenantId, apiKeyId, permissions }
2. hasPermission(auth, 'ingest') → true/false
3. checkRateLimit(apiKeyId) → { allowed, remaining }
4. Idempotency-Key? → checkIdempotency() → replay ou continua
5. DecisionSchema.safeParse(body) → validação Zod
6. hashObject(input) → inputHash
7. hashObject(output) → outputHash
8. hashObject(context) → contextHash (opcional)
9. Busca último record → previousHash
10. chainHash(previousHash, combinedData) → recordHash
11. generateTransactionId() → txn_abc...
12. Resolve policy snapshot (se policyId) → policyVersion, policyHash
13. prisma.decisionRecord.create({ ... })
14. storeIdempotency(tenantId, idempotencyKey, response)
15. Retorna { transaction_id, receipt_url, record_hash, chain_position }
```

### Fluxo 2: Checkpoint Periódico

```
Cron (1h) → POST /api/xase/v1/cron/checkpoint
  ↓
1. Busca tenants ativos
2. Para cada tenant:
   a. Busca último record → lastRecordHash
   b. Busca último checkpoint → previousCheckpointHash
   c. Conta records desde último checkpoint → recordCount
   d. Se recordCount = 0 → skip
   e. Calcula checkpointHash = SHA256(prev | last | count | timestamp)
   f. KMS.sign(checkpointHash) → signature
   g. prisma.checkpointRecord.create({ checkpointNumber: prev + 1, ... })
   h. logAudit('CHECKPOINT_CREATED')
3. Retorna { success, failed, errors }
```

### Fluxo 3: Export Forense

```
Cliente → GET /api/xase/v1/export/:id/download?include_payloads=true
  ↓
1. validateApiKey(request) → auth
2. hasPermission(auth, 'export') → true/false
3. Verifica cache: EvidenceBundle existe? → presigned URL ou continua
4. generateProofBundle(transactionId, { includePayloads })
   a. Busca DecisionRecord + checkpoint + policy
   b. Monta manifest.json
   c. Inclui payloads (se solicitado)
5. Monta decision.json (canonical JSON)
6. canonicalizeJSON(decision) → canonical
7. hashObject(decision) → decisionHash
8. signHash({ tenantId, resourceType: 'export', resourceId, hash: decisionHash })
   a. Valida hash format
   b. Rate limit (1000/h)
   c. KMS.sign(decisionHash) → signature
   d. getPublicKeyPem() → publicKeyPem
   e. logAudit('HASH_SIGNED')
9. Monta proof.json (signature + publicKeyPem + metadata)
10. Gera verify.js (script offline)
11. Gera report.txt (human-readable)
12. JSZip: decision.json + proof.json + verify.js + report.txt + policy.json + explanation.json + payloads/
13. zip.generateAsync({ type: 'nodebuffer' }) → buffer
14. Se storage habilitado:
    a. uploadBuffer(key, buffer) → { url, key, hash, size }
    b. prisma.evidenceBundle.create({ bundleId, storageUrl, storageKey, bundleHash, bundleSize })
    c. logAudit('BUNDLE_STORED')
    d. getPresignedUrl(storageKey, 3600) → presignedUrl
    e. logAudit('BUNDLE_DOWNLOADED')
    f. Retorna presignedUrl (redirect) ou JSON
15. Fallback: stream buffer direto
```

### Fluxo 4: Human Intervention

```
Analista → Abre RecordDetails → Clica "Add Intervention"
  ↓
1. InterventionDialog abre
2. Seleciona action (APPROVED/REJECTED/OVERRIDE/ESCALATED)
3. Preenche reason (obrigatório para REJECTED/OVERRIDE)
4. Se OVERRIDE: preenche newOutcome (JSON)
5. Clica "Submit"
6. POST /api/records/:id/intervene { action, reason, notes, newOutcome }
   ↓
7. getServerSession() → session
8. getTenantId() → tenantId
9. prisma.user.findUnique({ email }) → { xaseRole }
10. RBAC: role in ['OWNER', 'ADMIN', 'REVIEWER']? → 403 se não
11. InterventionSchema.safeParse(body) → validação
12. createIntervention({ transactionId, tenantId, action, actor, reason, newOutcome, IP, UA })
    a. Busca DecisionRecord
    b. Valida ação (OVERRIDE exige newOutcome; REJECTED/OVERRIDE exigem reason)
    c. Captura previousOutcome (se OVERRIDE)
    d. prisma.humanIntervention.create({ ... })
    e. prisma.decisionRecord.update({ hasHumanIntervention: true, finalDecisionSource: 'HUMAN_...' })
    f. logAudit('HUMAN_APPROVED/REJECTED/OVERRIDE')
13. Retorna { success, intervention_id, intervention }
14. Frontend: showToast('success') + loadInterventions() + reload page
```

---

## APIs REST (Referência Completa)

### Ingest

- **POST /api/xase/v1/records**
  - Auth: API Key (permissão `ingest`)
  - Body: `{ input, output, context?, policyId?, confidence?, storePayload? }`
  - Headers: `X-API-Key`, `Idempotency-Key?`
  - Response: `{ transaction_id, receipt_url, record_hash, chain_position }`

- **GET /api/xase/v1/records**
  - Auth: API Key
  - Query: `page`, `limit`, `search`, `policyId`
  - Response: `{ records[], pagination }`

### Verify

- **GET /api/xase/v1/verify/:id**
  - Auth: Público (sem auth) ou API Key
  - Response: `{ is_valid, status, verification, chain, checkpoint }`

### Export

- **GET /api/xase/v1/export/:id/download**
  - Auth: API Key (permissão `export`)
  - Query: `include_payloads` (default true), `download` (stream|redirect|json)
  - Response: ZIP stream ou `{ presigned_url, bundle_id, size, hash }`

### Checkpoints

- **GET /api/xase/v1/checkpoints**
  - Auth: API Key
  - Response: `{ checkpoints[], total }`

- **POST /api/xase/v1/cron/checkpoint**
  - Auth: Cron secret
  - Response: `{ success, failed, errors }`

### HITL (API pública)

- **POST /api/xase/v1/records/:id/intervene**
  - Auth: API Key (permissão `ingest` ou `intervene`)
  - Body: `{ action, actorName, actorEmail, actorRole?, reason?, notes?, newOutcome? }`
  - Response: `{ success, intervention_id, timestamp, actor }`

- **GET /api/xase/v1/records/:id/intervene**
  - Auth: API Key
  - Response: `{ interventions[], total }`

### HITL (UI)

- **POST /api/records/:id/intervene**
  - Auth: Sessão (Next-Auth)
  - RBAC: OWNER|ADMIN|REVIEWER
  - Body: `{ action, reason?, notes?, newOutcome? }`
  - Response: `{ success, intervention_id, intervention }`

- **GET /api/records/:id/intervene**
  - Auth: Sessão
  - RBAC: VIEWER+
  - Response: `{ interventions[], total }`

### API Keys

- **POST /api/xase/v1/api-keys**
  - Auth: Sessão (OWNER|ADMIN)
  - Body: `{ name, permissions }`
  - Response: `{ api_key, key_id, permissions }`

- **GET /api/xase/v1/api-keys**
  - Auth: Sessão
  - Response: `{ keys[] }`

- **DELETE /api/xase/v1/api-keys/:id**
  - Auth: Sessão (OWNER|ADMIN)
  - Response: `{ success }`

### Audit

- **GET /api/xase/v1/audit**
  - Auth: Sessão
  - Query: `action`, `resourceType`, `startDate`, `endDate`, `page`, `limit`
  - Response: `{ logs[], total }`

### Stats

- **GET /api/xase/v1/stats**
  - Auth: API Key
  - Response: `{ records, checkpoints, exports, interventions, policies }`

---

## Biblioteca Core

### crypto.ts

- `hashObject(obj)` – SHA-256 de JSON canônico.
- `hashString(str)` – SHA-256 de string.
- `chainHash(previousHash, data)` – hash encadeado.
- `generateTransactionId()` – `txn_` + 32 hex chars.
- `isValidTransactionId(id)` – regex `txn_[a-f0-9]{32}`.
- `canonicalizeJSON(obj)` – JCS (JSON Canonicalization Scheme).

### checkpoint.ts

- `createCheckpoint(data)` – cria checkpoint com KMS.
- `createCheckpointsForAllTenants()` – batch para cron.
- `verifyCheckpoint(checkpointId)` – verifica assinatura + hash + chain.

### export.ts

- `generateProofBundle(transactionId, options)` – gera manifest + payloads.

### human-intervention.ts

- `createIntervention(input)` – registra intervenção com validações.
- `getInterventions(transactionId, tenantId)` – lista intervenções.
- `getLatestIntervention(transactionId, tenantId)` – última intervenção.
- `getInterventionStats(tenantId)` – estatísticas.

### policies.ts

- `createPolicy(tenantId, policy)` – cria versão de política.
- `getActivePolicy(tenantId, policyId)` – busca ativa.
- `getPolicyVersion(tenantId, policyId, version)` – busca versão específica.
- `listPolicyVersions(tenantId, policyId)` – lista versões.
- `deactivatePolicy(tenantId, policyId, version)` – desativa.

### audit.ts

- `logAudit(entry)` – registra ação.
- `queryAuditLogs(filters)` – busca logs.

### auth.ts

- `validateApiKey(request)` – valida API Key.
- `hasPermission(auth, permission)` – verifica permissão.
- `checkRateLimit(apiKeyId)` – rate limit.
- `checkTenantAccess(userId, tenantId)` – RBAC console.

### signing-service.ts

- `signHash(req)` – assina hash com KMS + validação + rate limit.
- `verifySignature(hash, signature, publicKeyPem?)` – verifica assinatura.
- `getPublicKeyPem()` – retorna chave pública.

### storage.ts

- `uploadBuffer(key, buffer, contentType)` – upload para MinIO/S3.
- `getPresignedUrl(key, expiresIn)` – URL assinado.
- `isStorageConfigured()` – verifica configuração.

### kms.ts

- `getKMSProvider()` – retorna Mock ou AWS KMS.
- `sign(hash)` – assina hash.
- `verify(hash, signature)` – verifica assinatura.

### idempotency.ts

- `checkIdempotency(tenantId, key)` – verifica cache.
- `storeIdempotency(tenantId, key, response)` – armazena.
- `isValidIdempotencyKey(key)` – valida formato.

---

## Console Administrativo

### Páginas

- `/xase` – Dashboard (stats: records, checkpoints, exports, integrity).
- `/xase/records` – Lista de records com filtros.
- `/xase/records/:id` – Detalhes do record + intervenções + export.
- `/xase/checkpoints` – Lista de checkpoints + config.
- `/xase/audit` – Audit log com filtros.
- `/xase/api-keys` – Gerenciamento de API Keys.
- `/xase/docs` – Documentação de API.
- `/xase/receipt/:id` – Recibo público de decisão.

### Componentes

- `RecordDetails.tsx` – detalhes do record + lista de intervenções + badge `finalDecisionSource`.
- `InterventionDialog.tsx` – modal para criar intervenção (APPROVED/REJECTED/OVERRIDE/ESCALATED).

---

## Segurança e Compliance

### Imutabilidade

- Triggers SQL impedem UPDATE/DELETE em:
  - `xase_decision_records`
  - `xase_checkpoint_records`
  - `xase_human_interventions`
  - `xase_audit_logs`
- Exceção: campos derivados HITL (`hasHumanIntervention`, `finalDecisionSource`) podem ser atualizados.

### Criptografia

- Hashes: SHA-256.
- Assinaturas: RSA-SHA256 (KMS).
- Canonical JSON: JCS (RFC 8785).

### RBAC

- **Papéis**: OWNER, ADMIN, REVIEWER, VIEWER.
- **Permissões API Key**: ingest, export, verify, intervene.
- **Enforcement**: UI (sessão) e API (API Key).

### Compliance

- **LGPD/GDPR**: minimização (hash-only), retenção/anonimização planejada.
- **EU AI Act**: supervisão humana (HITL), rastreabilidade.
- **SOC 2**: audit trail, WORM, export forense.
- **ISO 27001**: accountability, RBAC, logs.

---

## Infraestrutura e Dependências

### Variáveis de ambiente

```bash
# Database
DATABASE_URL="postgres://..."

# Storage (MinIO ou S3)
MINIO_SERVER_URL="http://localhost:9000"
MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD="minioadmin"
BUCKET_NAME="xase"

# KMS (Mock ou AWS)
XASE_KMS_TYPE="mock" # ou "aws"
XASE_KMS_KEY_ID="..." # AWS KMS Key ID
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
```

### Dependências principais

```json
{
  "@prisma/client": "^5.x",
  "@aws-sdk/client-s3": "^3.x",
  "@aws-sdk/s3-request-presigner": "^3.x",
  "@aws-sdk/client-kms": "^3.x",
  "next": "14.x",
  "next-auth": "^4.x",
  "bcryptjs": "^2.x",
  "zod": "^3.x",
  "jszip": "^3.x"
}
```

### Migrations

- `006_add_human_interventions.sql` – tabela HITL.
- `007_fix_human_interventions_columns.sql` – ajustes.
- `008_fix_human_interventions_created_at.sql` – timestamp.
- `009_relax_immutability_allow_hitl.sql` – permite update de campos derivados.

---

## Referências de código

- Core: `src/lib/xase/*.ts`
- APIs: `src/app/api/xase/v1/**/*.ts`
- UI: `src/app/xase/**/*.tsx`
- Componentes: `src/components/xase/*.tsx`
- Migrations: `database/migrations/*.sql`
- Docs: `docs/*.md`
