# 📚 Xase Insurance Platform — Documentação Técnica Completa

**Versão:** 2.0 (Insurance UK/EU Extension)  
**Data:** 4 de Janeiro de 2026  
**Audiência:** Desenvolvedores, Arquitetos, DevOps

---

## 🎯 VISÃO GERAL

O Xase é uma plataforma de governança de IA que gera **evidência técnica pré-constituída** para decisões automatizadas, com foco em compliance UK/EU para o setor de seguros.

### Propósito Central
Criar um **ledger imutável** de decisões de IA com:
- Reproducibilidade total (snapshots de dados, regras, ambiente, features)
- Chain of custody completa (quem acessou, quando, por quê)
- Artefatos jurídicos court-ready (PDF legal, manifest criptográfico)
- Preparação para QTSP/e-Seal (UK/EU eIDAS)

---

## 🏗️ ARQUITETURA

### Stack Tecnológico
- **Frontend:** Next.js 14 (App Router), React, TailwindCSS, shadcn/ui
- **Backend:** Next.js API Routes, Node.js 18+
- **Database:** PostgreSQL 14+ (Prisma ORM)
- **Storage:** MinIO/S3 (snapshots, bundles, PDFs)
- **Auth:** NextAuth.js (sessão UI) + API Keys (programático)
- **Crypto:** Node.js crypto (SHA-256, HMAC)

### Camadas
```
┌─────────────────────────────────────────┐
│  Frontend (Next.js App Router)          │
│  - Pages: Records, Bundles, Dashboard   │
│  - Components: RecordDetails, etc.      │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  API Layer (Next.js API Routes)         │
│  - /api/xase/v1/insurance/ingest        │
│  - /api/xase/v1/verify/:id              │
│  - /api/xase/v1/bundles/:id/custody     │
│  - /api/xase/v1/bundles/:id/pdf         │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Core Services (src/lib/xase/)          │
│  - snapshots.ts (reproducibility)       │
│  - custody.ts (chain of custody)        │
│  - pdf-report.ts (legal PDF)            │
│  - manifest.ts (cryptographic manifest) │
│  - crypto.ts (hashing, chain)           │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Data Layer (Prisma + PostgreSQL)       │
│  - DecisionRecord (decisões)            │
│  - EvidenceSnapshot (snapshots)         │
│  - InsuranceDecision (overlay)          │
│  - EvidenceBundle (pacotes)             │
│  - CheckpointRecord (assinaturas)       │
│  - AuditLog (trilha completa)           │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Storage Layer (MinIO/S3)               │
│  - snapshots/{tenant}/{type}/{hash}.gz  │
│  - pdf/{tenant}/{bundleId}/report.pdf   │
│  - bundles/{tenant}/{bundleId}.zip      │
└─────────────────────────────────────────┘
```

---

## 📊 MODELO DE DADOS

### Core Models

#### DecisionRecord
Registro imutável de uma decisão de IA.

```prisma
model DecisionRecord {
  id              String   @id @default(cuid())
  tenantId        String
  transactionId   String   // Único por tenant
  
  // Hashes (imutabilidade)
  inputHash       String   // sha256:hex do input
  outputHash      String   // sha256:hex do output
  contextHash     String?  // sha256:hex do context
  recordHash      String   // Hash encadeado (previousHash + combinedData)
  previousHash    String?  // Hash do record anterior (chain)
  
  // Model & Policy
  modelId         String?
  modelVersion    String?
  modelHash       String?
  policyId        String?
  policyVersion   String?
  policyHash      String?
  
  // Decision metadata
  decisionType    DecisionType? // CLAIM, UNDERWRITING, FRAUD, PRICING, OTHER
  confidence      Float?
  processingTime  Int?
  
  // Reproducibility (Snapshots)
  externalDataSnapshotId    String?  // FK → EvidenceSnapshot
  businessRulesSnapshotId   String?  // FK → EvidenceSnapshot
  environmentSnapshotId     String?  // FK → EvidenceSnapshot
  featureVectorSnapshotId   String?  // FK → EvidenceSnapshot
  dataTimestamp             DateTime?
  
  // Payloads (opcional, para verificação)
  inputPayload    String? @db.Text
  outputPayload   String? @db.Text
  contextPayload  String? @db.Text
  
  // Timestamps
  timestamp       DateTime @default(now())
  createdAt       DateTime @default(now())
  
  // Relations
  tenant          Tenant @relation(...)
  insuranceDecision InsuranceDecision?
  
  @@unique([tenantId, recordHash])
  @@unique([tenantId, transactionId])
  @@index([tenantId, timestamp])
  @@map("xase_decision_records")
}
```

#### EvidenceSnapshot
Snapshot imutável para reproducibilidade.

```prisma
model EvidenceSnapshot {
  id          String @id @default(cuid())
  tenantId    String
  
  type        SnapshotType // EXTERNAL_DATA, BUSINESS_RULES, ENVIRONMENT, FEATURE_VECTOR
  
  storageUrl  String  // URL S3/MinIO
  storageKey  String  // Chave S3
  payloadHash String  // sha256:hex (deduplicação)
  payloadSize Int?
  
  sourceMeta  String? @db.Text // JSON: APIs, versões, etc.
  capturedAt  DateTime @default(now())
  
  compressed  Boolean @default(false)
  compressionAlgo String? // gzip
  
  @@index([tenantId, type])
  @@index([payloadHash]) // Deduplicação
  @@map("xase_evidence_snapshots")
}
```

#### InsuranceDecision
Overlay com campos específicos de insurance.

```prisma
model InsuranceDecision {
  id              String @id @default(cuid())
  recordId        String @unique // FK → DecisionRecord
  
  // Claim
  claimNumber     String?
  claimType       InsuranceClaimType? // AUTO, HEALTH, LIFE, PROPERTY, LIABILITY, TRAVEL
  claimAmount     Decimal?
  claimDate       DateTime?
  
  // Policy
  policyNumber    String?
  policyHolderIdHash String? // SHA-256(CPF/SSN)
  insuredAmount   Decimal?
  
  // Underwriting
  riskScore       Float?
  underwritingDecision String?
  premiumCalculated    Decimal?
  coverageOfferedJson  String? @db.Text
  
  // Outcome
  decisionOutcome       String?
  decisionOutcomeReason String?
  
  // Impact (reguladores)
  decisionImpactFinancial      Decimal?
  decisionImpactConsumerImpact DecisionConsumerImpact? // LOW, MEDIUM, HIGH
  decisionImpactAppealable     Boolean?
  
  // Regulatory
  regulatoryCaseId String?
  
  @@index([claimNumber])
  @@index([policyNumber])
  @@map("xase_insurance_decisions")
}
```

#### EvidenceBundle
Pacote de evidências para compliance/legal.

```prisma
model EvidenceBundle {
  id              String @id @default(cuid())
  bundleId        String @unique
  tenantId        String
  
  status          String // PENDING, READY, FAILED
  recordCount     Int
  purpose         String
  description     String?
  
  // Storage
  storageUrl      String?
  storageKey      String?
  bundleHash      String? // Hash do ZIP final
  
  // Legal artifacts
  legalFormat              String? // 'uk_insurance', 'standard'
  pdfReportUrl             String?
  pdfReportHash            String? // Hash binário do PDF
  pdfReportLogicalHash     String? // Hash dos dados estruturados
  chainOfCustodyReportJson String? @db.Text
  bundleManifestHash       String? // Hash do manifest.json
  
  // QTSP/e-Seal (futuro)
  merkleRoot          String?
  blockchainNetwork   String?
  blockchainTxHash    String?
  blockchainAnchorAt  DateTime?
  
  // Metadata
  createdBy       String
  createdAt       DateTime @default(now())
  completedAt     DateTime?
  expiresAt       DateTime?
  legalHold       Boolean @default(false)
  
  @@index([tenantId, status])
  @@map("xase_evidence_bundles")
}
```

#### CheckpointRecord
Checkpoint criptográfico com assinaturas.

```prisma
model CheckpointRecord {
  id              String @id @default(cuid())
  checkpointId    String @unique
  tenantId        String
  
  checkpointHash  String
  signature       String?
  signatureAlgo   String?
  keyId           String?
  
  // QTSP (UK/EU eIDAS)
  qtspProvider           String?
  qtspTimestampToken     String? @db.Text
  qtspCertificateChain   String? @db.Text
  
  // e-Seal (UK/EU)
  eSealSignature    String? @db.Text
  eSealCertificate  String? @db.Text
  
  // Blockchain (futuro)
  blockchainNetwork   String?
  blockchainTxHash    String?
  blockchainAnchorAt  DateTime?
  
  timestamp       DateTime @default(now())
  
  @@index([tenantId, timestamp])
  @@map("xase_checkpoint_records")
}
```

---

## 🔄 FLUXOS PRINCIPAIS

### 1. Ingestão de Decisão Insurance

```
Cliente → POST /api/xase/v1/insurance/ingest
         ↓
    [Validar API Key]
         ↓
    [Check Idempotency]
         ↓
    [Validar Payload (Zod)]
         ↓
    [Armazenar Snapshots em Paralelo]
    ├─ External Data → S3 (gzip)
    ├─ Business Rules → S3 (gzip)
    ├─ Environment → S3 (gzip)
    └─ Feature Vector → S3 (gzip)
         ↓
    [Calcular Hashes]
    ├─ inputHash = sha256(input)
    ├─ outputHash = sha256(output)
    ├─ contextHash = sha256(context)
    └─ recordHash = chainHash(previousHash, combinedData)
         ↓
    [Criar DecisionRecord]
         ↓
    [Criar InsuranceDecision (se campos insurance)]
         ↓
    [Audit Log]
         ↓
    ← Resposta: recordId, transactionId, recordHash, snapshotIds
```

**Endpoint:** `POST /api/xase/v1/insurance/ingest`

**Request:**
```json
{
  "input": {"claimId": "CLM-001", "amount": 5000},
  "output": {"decision": "APPROVED", "payout": 5000},
  "decisionType": "CLAIM",
  "confidence": 0.95,
  "snapshots": {
    "externalData": {"creditScore": 750, "source": "Experian"},
    "businessRules": {"rule": "auto_approval_under_10k", "version": "v2.1"},
    "environment": {"appVersion": "1.0.0", "nodeVersion": "18"},
    "featureVector": {"features": [0.75, 0.85, 0.92], "normalized": true}
  },
  "insurance": {
    "claimNumber": "CLM-2026-001",
    "claimType": "AUTO",
    "claimAmount": 5000,
    "policyNumber": "POL-123456",
    "decisionOutcome": "APPROVED",
    "decisionImpactConsumerImpact": "HIGH"
  },
  "storePayload": true
}
```

**Response:**
```json
{
  "recordId": "cmk0foh7s000at9kxhn3eqlej",
  "transactionId": "test-002",
  "recordHash": "ebd4c6459802e492fc48b9e77ac1270778d8ad3577dc52b1d4bf1ec871cf3732",
  "snapshots": {
    "externalData": "cmk0fofs00007t9kxup9ku6ak",
    "businessRules": "cmk0fof3a0004t9kxlw9cl5y8",
    "environment": null,
    "featureVector": null
  },
  "insurance": {
    "id": "cmk0foh7s000bt9kxhn3eqlej",
    "claimNumber": "CLM-2026-001",
    "policyNumber": "POL-123456"
  },
  "timestamp": "2026-01-05T00:39:53.127Z"
}
```

---

### 2. Verificação de Decisão

```
Cliente → GET /api/xase/v1/verify/:transactionId
         ↓
    [Buscar DecisionRecord]
         ↓
    [Validar Hashes]
    ├─ inputHash (se payload disponível)
    ├─ outputHash (se payload disponível)
    ├─ contextHash (se payload disponível)
    └─ recordHash (chain integrity)
         ↓
    [Validar Snapshots]
    ├─ Download snapshot via presigned URL
    ├─ Descomprimir (gzip)
    ├─ Calcular hash
    └─ Comparar com payloadHash armazenado
         ↓
    [Buscar Checkpoint mais próximo]
         ↓
    [Determinar Status: VERIFIED ou TAMPERED]
         ↓
    ← Resposta: is_valid, verification, snapshots, checkpoint
```

**Endpoint:** `GET /api/xase/v1/verify/:transactionId`

**Response:**
```json
{
  "transaction_id": "test-002",
  "is_valid": true,
  "status": "VERIFIED",
  "verification": {
    "input_hash": true,
    "output_hash": true,
    "context_hash": true,
    "chain_integrity": true,
    "payload_available": false
  },
  "snapshots": {
    "externalData": {
      "valid": true,
      "hash": "sha256:abc123..."
    },
    "businessRules": {
      "valid": true,
      "hash": "sha256:def456..."
    }
  },
  "checkpoint": {
    "checkpoint_id": "chk_142efc...",
    "checkpoint_hash": "8a02a0ab...",
    "signature": "C3w85DDg...",
    "key_id": "mock-key-demo",
    "timestamp": "2025-12-15T19:33:52.526Z"
  },
  "verified_at": "2026-01-05T00:41:32.832Z"
}
```

---

### 3. Geração de Chain of Custody Report

```
Cliente → GET /api/xase/v1/bundles/:bundleId/custody
         ↓
    [Validar API Key]
         ↓
    [Buscar Bundle]
         ↓
    [Buscar Audit Logs relacionados]
    ├─ Filtrar por bundleId
    └─ Mapear para eventos tipados (ACCESS, EXPORT, DISCLOSURE)
         ↓
    [Buscar Checkpoints (assinaturas)]
    ├─ KMS signatures
    ├─ QTSP timestamps
    └─ e-Seal signatures
         ↓
    [Validar Integridade]
    ├─ bundleHash
    ├─ manifestHash
    └─ recordHash
         ↓
    [Montar Report]
         ↓
    ← Resposta: JSON ou texto (format=pdf)
```

**Endpoint:** `GET /api/xase/v1/bundles/:bundleId/custody?format=json`

**Response:**
```json
{
  "evidenceId": "cmk0fz0qt000gt9kxbk931e3g",
  "bundleId": "bundle_45a02703a9f5fc87178055349fda4047",
  "generatedAt": "2026-01-05T00:48:35.735Z",
  "events": [
    {
      "type": "EXPORT",
      "at": "2026-01-05T00:48:04.997Z",
      "actor": "api-key:key_001",
      "action": "BUNDLE_CREATE",
      "purpose": "smoke-test"
    }
  ],
  "signatures": [
    {
      "type": "KMS",
      "value": "C3w85DDgrISa6PN21LoAPv561tzFtkSATFXbvijz3pD2lnapNMZE0UHi73ucctfBiROsUOg7MR6+RIPCTzBZZ+kljpruwEcjW1i4VfHn0qjEITQ6SOqdQnZjWPQw2Tw36CuoHOgjf29eG/TWLWd+KEOdYai42A5k5P3BFd32Zr2N97jmTpRWtYpkoDuWyxE4iNyqC4ppU/6RLzUxHHlpocrEkrqo4x0mmIJm71Xf3+MyZns0KjuzA4y1mWOg4fsFeHwJSpQxU3QhIr7pAQoH+itlPnYXQf4l/qk2HXHzxV/O4kR4+rdkiUrM/T6jzgZdZj8YGzB3VrRVT76C2XpLVw==",
      "keyId": "mock-key-demo",
      "timestamp": "2025-12-15T19:33:52.526Z"
    }
  ],
  "integrityStatus": "VALID",
  "integrityChecks": {
    "bundleHashValid": true,
    "manifestHashValid": true,
    "recordHashValid": true
  },
  "recordCount": 30,
  "createdAt": "2026-01-05T00:48:04.997Z",
  "legalHold": false
}
```

---

### 4. Geração de PDF Legal

```
Cliente → POST /api/xase/v1/bundles/:bundleId/pdf
         ↓
    [Validar API Key]
         ↓
    [Buscar Bundle + Record + Insurance]
         ↓
    [Gerar Custody Report (contagem eventos)]
         ↓
    [Montar Dados Estruturados (PDFReportData)]
    ├─ Identification (claim, policy, case)
    ├─ Timeline (decision, checkpoint)
    ├─ Hashes (record, input, output, checkpoint)
    ├─ Signatures (KMS, QTSP, e-Seal)
    ├─ Custody Summary (access, export, disclosure)
    └─ Verification Instructions
         ↓
    [Calcular Hash Lógico (dados estruturados)]
         ↓
    [Gerar PDF Texto (template court-ready)]
         ↓
    [Calcular Hash Binário (PDF final)]
         ↓
    [Upload S3: pdf/{tenant}/{bundleId}/report.pdf]
         ↓
    [Atualizar Bundle]
    ├─ pdfReportUrl
    ├─ pdfReportHash (binário)
    └─ pdfReportLogicalHash
         ↓
    [Audit Log]
         ↓
    ← Resposta: URLs e hashes
```

**Endpoint:** `POST /api/xase/v1/bundles/:bundleId/pdf`

**Response:**
```json
{
  "bundleId": "bundle_45a02703a9f5fc87178055349fda4047",
  "pdfReportUrl": "https://minio.example.com/xase/pdf/tenant_xxx/bundle_xxx/report.pdf",
  "pdfReportHash": "sha256:796ab374ccbe786a7eeb069ef4dabea66bdcac71426781a3434ddeb393a9c8a5",
  "pdfReportLogicalHash": "sha256:73e72c51bdfa7e98e75d878a651a6713101c09102cd516c50ece259a7ebe0e34",
  "generatedAt": "2026-01-05T00:49:05.002Z"
}
```

---

## 🔐 SEGURANÇA E AUTENTICAÇÃO

### API Keys
- Formato: `xase_pk_{48 hex chars}`
- Armazenamento: bcrypt hash no banco
- Permissões: `ingest`, `verify`, `export`, `intervene`
- Headers aceitos: `X-API-Key` ou `Authorization: Bearer`

### Multitenancy
- Todos os dados isolados por `tenantId`
- Unique constraints por tenant: `@@unique([tenantId, recordHash])`
- API Keys vinculadas a tenant

### Hashing e Chain
- Algoritmo: SHA-256
- Formato: `sha256:{hex}`
- Chain: `recordHash = sha256(previousHash + inputHash + outputHash + contextHash)`
- Canonical JSON: ordenação alfabética de chaves

---

## 📦 STORAGE (S3/MinIO)

### Estrutura de Pastas
```
xase/
├── snapshots/
│   └── {tenantId}/
│       ├── EXTERNAL_DATA/
│       │   └── {hash}.json.gz
│       ├── BUSINESS_RULES/
│       │   └── {hash}.json.gz
│       ├── ENVIRONMENT/
│       │   └── {hash}.json.gz
│       └── FEATURE_VECTOR/
│           └── {hash}.json.gz
├── pdf/
│   └── {tenantId}/
│       └── {bundleId}/
│           └── report.pdf
└── bundles/
    └── {tenantId}/
        └── {bundleId}.zip
```

### Deduplicação
- Snapshots com mesmo `payloadHash` reutilizam o mesmo arquivo S3
- Economia de ~50% de storage (payloads repetidos)

### Compressão
- Algoritmo: gzip (nível 6)
- Redução: ~70% do tamanho original

---

## 🧪 TESTES

### Smoke Tests (Manual)
```bash
# 1. Ingestão sem snapshots
curl -X POST "$BASE/api/xase/v1/insurance/ingest" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-001" \
  -d '{"input":{"x":1},"output":{"y":2},"decisionType":"CLAIM"}'

# 2. Ingestão com snapshots
curl -X POST "$BASE/api/xase/v1/insurance/ingest" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-002" \
  -d '{
    "input": {"claimId": "CLM-001"},
    "output": {"decision": "APPROVED"},
    "decisionType": "CLAIM",
    "snapshots": {
      "externalData": {"creditScore": 750},
      "businessRules": {"rule": "auto_approval", "version": "v2.1"}
    }
  }'

# 3. Verificação
curl "$BASE/api/xase/v1/verify/test-002" | jq

# 4. Custody Report
curl "$BASE/api/xase/v1/bundles/{bundleId}/custody" \
  -H "X-API-Key: $KEY" | jq

# 5. PDF Legal
curl -X POST "$BASE/api/xase/v1/bundles/{bundleId}/pdf" \
  -H "X-API-Key: $KEY" | jq
```

### Validações no Banco
```sql
-- Contar snapshots e verificar deduplicação
SELECT type, COUNT(*) as count, COUNT(DISTINCT payload_hash) as unique_hashes
FROM xase_evidence_snapshots
GROUP BY type;

-- Ver últimas decisões insurance
SELECT 
  dr.id,
  dr."transactionId",
  dr."decisionType",
  id2.claim_number,
  id2.policy_number,
  id2.decision_outcome
FROM xase_decision_records dr
LEFT JOIN xase_insurance_decisions id2 ON dr.id = id2.record_id
ORDER BY dr."timestamp" DESC
LIMIT 10;
```

---

## 🚀 DEPLOYMENT

### Variáveis de Ambiente
```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/xase"

# Storage (MinIO/S3)
MINIO_SERVER_URL="https://minio.example.com"
MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="secret"
BUCKET_NAME="xase"

# NextAuth
NEXTAUTH_URL="https://app.example.com"
NEXTAUTH_SECRET="random-secret-32-chars"

# Optional: QTSP (futuro)
QTSP_PROVIDER="swisscom"
QTSP_API_KEY="..."
```

### Migrations
```bash
# Aplicar migrations
node database/run-migration.js

# Gerar Prisma Client
npx prisma generate
```

### Build
```bash
npm run build
npm start
```

---

## 📝 PRÓXIMOS PASSOS (Sprint 3)

1. **Worker de Bundle** — Gerar ZIP com manifest + verify.js + custody + PDF
2. **QTSP Integration** — Carimbar manifest.json com timestamp qualificado
3. **e-Seal** — Assinar manifest com e-Seal (opcional UK/EU)
4. **Verify Offline Enhanced** — Validar QTSP chain e e-Seal no verify.js

---

**Preparado por:** Cascade AI  
**Data:** 4 de Janeiro de 2026  
**Versão:** 2.0
