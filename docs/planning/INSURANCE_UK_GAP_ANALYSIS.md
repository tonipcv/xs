# 🎯 Xase Insurance (UK-first) — GAP Analysis & Implementation Plan

**Data:** 4 de Janeiro de 2026  
**Versão:** 1.0  
**Objetivo:** Análise detalhada do que existe vs. o que precisa ser construído para insurance UK/EU

---

## 📊 RESUMO EXECUTIVO

### O que JÁ TEMOS (✅ 70%)
- Ledger imutável com hash chain
- Checkpoints periódicos com assinatura KMS
- Evidence bundles com export
- Human-in-the-Loop completo
- Audit trail WORM
- Model Cards e Policies
- APIs de ingestão e verificação
- Job queue (Postgres-backed)

### O que FALTA (❌ 30%)
- **Campos insurance** (claim, policy, underwriting, impact)
- **Reproducibility snapshots** (external data, business rules, environment)
- **Chain of Custody report** (artefato exportável)
- **PDF legal template** (court-ready)
- **QTSP integration** (UK/EU qualified timestamp)
- **e-Seal** (opcional, UK/EU qualified signature)
- **Insurance-specific APIs** (ingest, export formats)

---

## 🔍 GAP ANALYSIS DETALHADO

### 1️⃣ MODELOS DE DADOS (Schema/Prisma)

#### DecisionRecord (EXISTENTE — precisa estender)

**✅ JÁ TEM:**
```prisma
model DecisionRecord {
  id, tenantId, transactionId
  policyId, policyVersion, policyHash
  modelId, modelVersion, modelHash, featureSchemaHash
  inputHash, outputHash, contextHash, recordHash, previousHash
  decisionType, confidence, processingTime
  inputPayload, outputPayload, contextPayload (Text, opcional)
  storageUrl (S3/R2)
  hasHumanIntervention, finalDecisionSource
  timestamp, createdAt
}
```

**❌ FALTA:**
- `externalDataSnapshotId` (FK para snapshot store)
- `businessRulesSnapshotId` (FK para snapshot store)
- `environmentSnapshotId` (FK para snapshot store)
- `dataTimestamp` (quando dados externos foram coletados)

**Nota:** `decisionType` já existe mas precisa suportar valores insurance: "CLAIM", "UNDERWRITING", "FRAUD", "PRICING"

---

#### InsuranceDecision (NOVO — não existe)

**❌ PRECISA CRIAR:**
```prisma
model InsuranceDecision {
  id              String @id @default(cuid())
  recordId        String @unique // FK para DecisionRecord
  
  // Claim
  claimNumber     String?
  claimType       InsuranceClaimType?
  claimAmount     Decimal?
  claimDate       DateTime?
  
  // Policy
  policyNumber    String?
  policyHolderIdHash String? // SHA-256
  insuredAmount   Decimal?
  
  // Underwriting
  riskScore       Float?
  underwritingDecision String?
  premiumCalculated    Decimal?
  coverageOfferedJson  String? @db.Text
  
  // Decision Impact (reguladores)
  decisionImpactFinancial      Decimal?
  decisionImpactConsumerImpact DecisionConsumerImpact?
  decisionImpactAppealable     Boolean?
  
  // Regulatory
  regulatoryCaseId String?
  
  // Timestamps
  createdAt DateTime @default(now())
  
  // Relations
  record DecisionRecord @relation(fields: [recordId], references: [id])
  
  @@index([claimNumber])
  @@index([policyNumber])
  @@index([claimType])
  @@index([claimDate])
  @@map("xase_insurance_decisions")
}

enum InsuranceClaimType {
  AUTO
  HEALTH
  LIFE
  PROPERTY
  LIABILITY
  TRAVEL
  @@map("xase_insurance_claim_type")
}

enum DecisionConsumerImpact {
  LOW
  MEDIUM
  HIGH
  @@map("xase_decision_consumer_impact")
}
```

---

#### EvidenceSnapshot (NOVO — não existe)

**❌ PRECISA CRIAR:**
```prisma
model EvidenceSnapshot {
  id          String @id @default(cuid())
  tenantId    String
  
  // Tipo de snapshot
  type        SnapshotType // EXTERNAL_DATA | BUSINESS_RULES | ENVIRONMENT
  
  // Storage (S3/MinIO)
  storageUrl  String
  storageKey  String
  payloadHash String // SHA-256 do JSON canonical
  payloadSize Int?
  
  // Metadata
  sourceMeta  String? @db.Text // JSON: APIs consultadas, versões, etc.
  capturedAt  DateTime @default(now())
  
  // Compression
  compressed  Boolean @default(false)
  compressionAlgo String? // gzip, brotli

  // Reuso (múltiplos records podem referenciar o mesmo snapshot)
  // Snapshots são IMUTÁVEIS — nunca atualizados após criação
  referenceCount Int @default(0) // quantos records apontam para este snapshot
  
  // Relations
  tenant      Tenant @relation(fields: [tenantId], references: [id])
  
  @@index([tenantId])
  @@index([type])
  @@index([capturedAt])
  @@index([payloadHash]) // para deduplicação
  @@map("xase_evidence_snapshots")
}

enum SnapshotType {
  EXTERNAL_DATA
  BUSINESS_RULES
  ENVIRONMENT
  @@map("xase_snapshot_type")
}
```

---

#### CheckpointRecord (EXISTENTE — precisa estender)

**✅ JÁ TEM:**
```prisma
model CheckpointRecord {
  id, tenantId, checkpointId, checkpointType, checkpointNumber
  lastRecordHash, recordCount, merkleRoot, checkpointHash
  signature, signatureAlgo, keyId (KMS)
  tsaToken, tsaUrl, tsaTimestamp (RFC3161 — estrutura existe)
  previousCheckpointId, isVerified, verifiedAt
  timestamp, createdAt
}
```

**❌ FALTA (UK/EU):**
- `qtspProvider` (GlobalSign, Entrust, etc.)
- `qtspTimestampToken` (Text, base64)
- `qtspCertificateChain` (Text, PEM)
- `eSealSignature` (Text, base64/CMS)
- `eSealCertificate` (Text, PEM)
- `publicKeyFingerprint` (para verificação offline)

**❌ FALTA (Blockchain opcional):**
- `blockchainNetwork` (polygon, base, etc.)
- `blockchainTxHash`
- `blockchainAnchorAt`

---

#### EvidenceBundle (EXISTENTE — precisa estender)

**✅ JÁ TEM:**
```prisma
model EvidenceBundle {
  id, tenantId, recordId, bundleId, transactionId
  status (PENDING, PROCESSING, READY, FAILED)
  purpose, description, recordCount
  dateFrom, dateTo
  storageUrl, storageKey, bundleHash, bundleSize
  format, includesPdf, includesPayloads
  retentionUntil, expiresAt, legalHold
  createdBy, createdAt, completedAt, accessedAt
}
```

**❌ FALTA:**
- `legalFormat` ('standard' | 'ediscovery' | 'uk_eidas' | 'us_esign')
- `pdfReportUrl`
- `pdfReportHash`
- `chainOfCustodyReportJson` (Text) ou `custodyReportUrl`
- `bundleManifestHash` (SHA-256 do manifest.json)
- `merkleRoot` (opcional, blockchain)
- `blockchainNetwork`, `blockchainTxHash`, `blockchainAnchorAt` (opcional)

---

#### AuditLog (EXISTENTE — verificar cobertura)

**✅ JÁ TEM:**
```prisma
model AuditLog {
  id, tenantId, userId
  action, resourceType, resourceId
  metadata (JSON), ipAddress, userAgent
  status (SUCCESS, FAILED, DENIED)
  errorMessage
  timestamp (imutável)
}
```

**✅ COBERTURA ATUAL:**
- KEY_CREATED, KEY_ROTATED, KEY_REVOKED
- BUNDLE_CREATE, BUNDLE_DOWNLOAD
- RECORD_CREATED, RECORD_ACCESSED
- HUMAN_* (interventions)

**❌ FALTA LOGAR:**
- SNAPSHOT_CREATED
- CHECKPOINT_TIMESTAMPED (QTSP)
- CHECKPOINT_ESEAL_APPLIED
- BUNDLE_PDF_GENERATED
- CUSTODY_REPORT_GENERATED
- VERIFY_CALLED (já existe?)
- LEGAL_HOLD_SET, LEGAL_HOLD_REMOVED

---

### 2️⃣ APIs (Rotas)

#### ✅ JÁ EXISTEM:

1. **POST /api/xase/v1/records** — ingestão básica
   - Cria DecisionRecord
   - Calcula hashes
   - Encadeia (previousHash)
   - Retorna transactionId

2. **GET /api/xase/v1/verify/:id** — verificação
   - Valida hash chain
   - Valida assinatura checkpoint
   - Status: VALID/INVALID

3. **POST /api/xase/v1/export/:id** — export bundle
   - Gera proof bundle
   - Retorna ZIP ou URL

4. **GET /api/xase/v1/checkpoints** — lista checkpoints

5. **POST /api/xase/v1/cron/checkpoint** — cron checkpoint

6. **GET /api/xase/v1/audit** — audit logs

7. **POST /api/xase/v1/records/:id/intervene** — HITL

8. **GET /api/xase/v1/model-cards** — model cards

9. **GET /api/xase/v1/metrics** — métricas

#### ❌ FALTA CRIAR:

1. **POST /api/xase/v1/insurance/ingest** — ingestão insurance
   - Payload: claim/policy/underwriting + snapshots
   - Cria DecisionRecord + InsuranceDecision
   - Armazena snapshots (S3 + hash)
   - Retorna recordId + transactionId

2. **GET /api/xase/v1/bundles/:id/custody** — chain of custody
   - Gera ChainOfCustodyReport (JSON)
   - Lista access/export events
   - Assinaturas aplicadas
   - Status de integridade

3. **POST /api/xase/v1/bundles/:id/pdf** — PDF legal
   - Gera PDF court-ready
   - Armazena (S3)
   - Retorna URL + hash

4. **POST /api/xase/v1/bundles/create** — estender
   - Adicionar `legalFormat`
   - Filtros insurance: `claimNumbers[]`, `policyNumber`, `caseId`
   - `includeSnapshots` (true/false)

5. **GET /api/xase/v1/verify/:id** — estender
   - Validar snapshots (hashes batem)
   - Validar QTSP token (quando existir)
   - Retornar status detalhado

---

### 3️⃣ JOBS / WORKERS

#### ✅ JÁ EXISTEM:

1. **CREATE_CHECKPOINT** (cron)
   - Roda periodicamente
   - Calcula checkpointHash
   - Assina via KMS
   - Grava CheckpointRecord

2. **GENERATE_BUNDLE** (async)
   - Gera bundle ZIP
   - Upload S3
   - Atualiza status

#### ❌ FALTA CRIAR:

1. **TIMESTAMP_CHECKPOINT_QTSP** (UK/EU)
   - Chama QTSP provider
   - Recebe qualified timestamp token
   - Grava em CheckpointRecord
   - Log audit

2. **APPLY_ESEAL_CHECKPOINT** (UK/EU, opcional)
   - Aplica e-Seal qualificado
   - Grava assinatura/certs
   - Log audit

3. **STORE_SNAPSHOT** (async)
   - Comprime snapshot (gzip)
   - Upload S3
   - Calcula hash
   - Cria EvidenceSnapshot

4. **GENERATE_PDF_REPORT** (async)
   - Gera PDF court-ready
   - Upload S3
   - Atualiza EvidenceBundle

5. **ENFORCE_LEGAL_HOLD** (cron diário)
   - Verifica bundles com legalHold
   - Impede expiração/deleção

---

### 4️⃣ INTEGRAÇÕES EXTERNAS

#### ✅ JÁ EXISTEM:

1. **AWS KMS** (assinatura)
   - `src/lib/xase/kms.ts`
   - Mock local + AWS KMS
   - ECDSA P-256

2. **S3/MinIO** (storage)
   - `src/lib/xase/storage.ts`
   - Upload/download
   - Pre-signed URLs

#### ❌ FALTA CRIAR:

1. **QTSP Provider Interface** (UK/EU)
   ```typescript
   interface QTSPProvider {
     createQualifiedTimestamp(hashBytes: Buffer): Promise<{
       token: string; // base64
       certChain: string; // PEM
       providerMeta: any;
     }>;
     
     verifyQualifiedTimestamp(token: string): Promise<{
       valid: boolean;
       timestamp: Date;
       certChain: string;
     }>;
   }
   ```

2. **e-Seal Provider Interface** (UK/EU, opcional)
   ```typescript
   interface ESealProvider {
     signWithESeal(manifestHash: string): Promise<{
       signature: string; // base64/CMS
       certChain: string; // PEM
     }>;
     
     verifyESeal(signature: string, certChain: string): Promise<{
       valid: boolean;
     }>;
   }
   ```

3. **Implementação GlobalSign** (QTSP)
   - SDK/API client
   - Autenticação
   - Rate limiting

---

### 5️⃣ BUNDLE CONTENTS

#### ✅ JÁ TEM (export.ts):

- `decision.json` (record completo)
- `proof.json` (hashes, chain, checkpoint)
- `verify.js` (verificação offline)
- `payloads/` (input/output/context)
- `policy.json` (se houver)
- `report.txt` (resumo)

#### ❌ FALTA:

- `snapshots/` (external_data.json, business_rules.json, environment.json)
- `model_cards/` (se referenciado)
- `audit_trail.json` (eventos relevantes)
- `chain_of_custody.json` (quem acessou, quando, de onde)
- `manifest.json` (lista de arquivos + hashes SHA-256)
- `signature.json` (KMS + QTSP + e-Seal)
- `README.md` (atualizado com instruções QTSP/e-Seal)
- `report.pdf` (court-ready)

---

### 6️⃣ VERIFICAÇÃO OFFLINE

#### ✅ JÁ TEM (verify.js):

- Valida hashes do decision.json
- Valida encadeamento (previousHash)
- Valida assinatura KMS

#### ❌ FALTA:

- Validar hashes do manifest.json
- Validar QTSP token (estrutura, cadeia X.509)
- Validar e-Seal signature
- Validar snapshots (hashes batem)
- Output detalhado: lista de checks + status individual

---

## 📋 TICKETS DE IMPLEMENTAÇÃO (Ordem Recomendada)

### 🔴 SPRINT 1 (Semana 1-2) — Schema & Snapshots

#### Ticket 1.1: Schema Extensions (Prisma)
**Prioridade:** 🔴 CRÍTICA  
**Estimativa:** 3 pontos

**Descrição:**
Estender schema Prisma para suportar insurance e snapshots.

**Tarefas:**
- [ ] Criar enum `InsuranceClaimType`, `DecisionConsumerImpact`, `SnapshotType`
- [ ] Criar model `InsuranceDecision` com todos os campos
- [ ] Criar model `EvidenceSnapshot`
- [ ] Estender `DecisionRecord`: adicionar `*SnapshotId`, `dataTimestamp`
- [ ] Estender `CheckpointRecord`: adicionar campos QTSP/e-Seal
- [ ] Estender `EvidenceBundle`: adicionar `legalFormat`, `pdfReportUrl/Hash`, `custodyReportJson`, `manifestHash`
- [ ] Criar migração Prisma
- [ ] Gerar Prisma client
- [ ] Testar migração em dev

**Critérios de aceite:**
- ✅ Migração roda sem erros
- ✅ Todos os campos acessíveis via Prisma client
- ✅ Índices criados corretamente
- ✅ Enums funcionando

**Arquivos:**
- `prisma/schema.prisma`
- `prisma/migrations/*/migration.sql`

---

#### Ticket 1.2: Snapshot Storage Service
**Prioridade:** 🔴 CRÍTICA  
**Estimativa:** 5 pontos

**Descrição:**
Implementar serviço de armazenamento de snapshots (S3 + hash).

**Tarefas:**
- [ ] Criar `src/lib/xase/snapshots.ts`
- [ ] Função `storeSnapshot(type, payload, tenantId)`:
  - Canonical JSON
  - Compressão gzip
  - Upload S3 (key: `snapshots/{tenantId}/{type}/{hash}.json.gz`)
  - Calcular SHA-256
  - Criar `EvidenceSnapshot` record
  - Retornar `snapshotId`
- [ ] Função `retrieveSnapshot(snapshotId)`:
  - Buscar record
  - Download S3
  - Descomprimir
  - Validar hash
  - Retornar payload
- [ ] Função `verifySnapshot(snapshotId, expectedHash)`:
  - Download + hash
  - Comparar
  - Retornar valid/invalid
- [ ] Testes unitários

**Critérios de aceite:**
- ✅ Snapshot armazenado e recuperado corretamente
- ✅ Hash validado
- ✅ Compressão funciona
- ✅ Erros tratados (S3 down, hash mismatch)

**Arquivos:**
- `src/lib/xase/snapshots.ts`
- `src/lib/xase/snapshots.test.ts`

---

#### Ticket 1.3: Insurance Ingest API
**Prioridade:** 🔴 CRÍTICA  
**Estimativa:** 8 pontos

**Descrição:**
Criar endpoint de ingestão específico para insurance com snapshots.

**Tarefas:**
- [ ] Criar `src/app/api/xase/v1/insurance/ingest/route.ts`
- [ ] Schema Zod para validação:
  - `input`, `output`, `context` (ou refs)
  - `model: {id, version, hash}`
  - `policy: {id, version, hash}`
  - Insurance fields (claim/policy/underwriting/impact)
  - Snapshots: `externalDataSnapshot`, `businessRulesSnapshot`, `environmentSnapshot`
  - `dataTimestamp`
- [ ] Lógica:
  1. Validar API Key
  2. Validar payload
  3. Armazenar snapshots (S3 + hash) → obter IDs
  4. Calcular hashes (input/output/context)
  5. Buscar último record (previousHash)
  6. Calcular recordHash
  7. Criar `DecisionRecord` (com snapshotIds)
  8. Criar `InsuranceDecision`
  9. Log audit (RECORD_INGESTED, SNAPSHOT_CREATED)
  10. Retornar `{recordId, transactionId, recordHash}`
- [ ] Rate limiting
- [ ] Idempotency-Key support
- [ ] Testes E2E

**Critérios de aceite:**
- ✅ Ingestão completa funciona
- ✅ Snapshots armazenados e linkados
- ✅ DecisionRecord + InsuranceDecision criados
- ✅ Hash chain válido
- ✅ Audit log registrado
- ✅ Erros tratados (validação, S3, DB)

**Arquivos:**
- `src/app/api/xase/v1/insurance/ingest/route.ts`
- `tests/e2e/insurance-ingest.test.ts`

---

### 🟠 SPRINT 2 (Semana 3-4) — Manifest & Artefatos Jurídicos MVP

**Ordem otimizada:** Manifest ANTES de PDF (PDF vira "view", não fundamento da prova).

#### Ticket 2.1: Bundle Manifest & Enhanced Verify
**Prioridade:** 🔴 CRÍTICA  
**Estimativa:** 5 pontos

**Descrição:**
Adicionar manifest.json e conteúdos adicionais ao bundle. Manifest é o fundamento criptográfico.

**Tarefas:**
- [ ] Atualizar `src/lib/xase/export.ts`
- [ ] Adicionar ao bundle ZIP:
  - `manifest.json`:
    ```json
    {
      "version": "2.0",
      "bundleId": "...",
      "generatedAt": "...",
      "files": [
        {"path": "decision.json", "hash": "sha256:...", "size": 123},
        {"path": "snapshots/external_data.json.gz", "hash": "sha256:...", "size": 456}
      ],
      "manifestHash": "sha256:..." // hash do próprio manifest (excluindo este campo)
    }
    ```
  - `snapshots/` (quando includeSnapshots=true)
  - `audit_trail.json` (eventos relevantes)
  - `chain_of_custody.json` (gerado via custody service)
- [ ] Calcular `manifestHash` (SHA-256 canonical do manifest, excluindo o próprio campo hash)
- [ ] Armazenar em `EvidenceBundle.bundleManifestHash`
- [ ] Atualizar `verify.js` para:
  - Validar manifest primeiro
  - Validar cada arquivo listado (hash + existência)
  - Validar snapshots (se incluídos)
  - Output detalhado de checks
- [ ] Testes

**Critérios de aceite:**
- ✅ Manifest gerado corretamente
- ✅ Todos os arquivos listados com hashes SHA-256
- ✅ Snapshots incluídos (quando solicitado)
- ✅ Verify.js valida manifest ANTES de qualquer outra coisa
- ✅ Prova verificável mesmo sem PDF

**Arquivos:**
- `src/lib/xase/export.ts`

---

#### Ticket 2.2: Chain of Custody Report
**Prioridade:** 🔴 ALTA  
**Estimativa:** 5 pontos

**Descrição:**
Implementar geração de Chain of Custody Report (JSON + PDF).

**Tarefas:**
- [ ] Criar `src/lib/xase/custody.ts`
- [ ] Interface `ChainOfCustodyReport`:
  ```typescript
  {
    evidenceId: string;
    events: Array<{
      type: 'ACCESS' | 'EXPORT' | 'DISCLOSURE';
      at: string;
      actor: string;
      action: string; // 'VIEW' | 'DOWNLOAD' | 'VERIFY' | 'SEND_TO_REGULATOR'
      ip?: string;
      ua?: string;
      purpose?: string; // 'Regulatory disclosure', 'Legal discovery', etc.
      recipient?: string; // 'UK FCA', 'External counsel', etc.
      authorizedBy?: string; // quem autorizou (GC, OWNER)
    }>;
    signatures: Array<{type, value, keyId, at}>;
    integrityStatus: 'VALID' | 'TAMPER_EVIDENT' | 'UNKNOWN';
  }
  ```
- [ ] Função `generateCustodyReport(bundleId)`:
  - Buscar bundle
  - Buscar audit logs e classificar por tipo:
    - ACCESS: BUNDLE_VIEWED, RECORD_ACCESSED
    - EXPORT: BUNDLE_DOWNLOADED, BUNDLE_EXPORTED
    - DISCLOSURE: BUNDLE_SENT_TO_REGULATOR, BUNDLE_SENT_TO_COUNSEL
  - Buscar checkpoints aplicáveis
  - Buscar assinaturas (KMS, QTSP, e-Seal)
  - Validar integridade (hash atual vs. original)
  - Montar report
- [ ] Endpoint `GET /api/xase/bundles/:id/custody`:
  - Autenticação (sessão ou API key)
  - RBAC (OWNER/ADMIN)
  - Gerar report JSON
  - Opção `?format=pdf` (gera PDF)
  - Log audit (CUSTODY_REPORT_GENERATED)
- [ ] Template PDF (simples, tabela de eventos)
- [ ] Testes

**Critérios de aceite:**
- ✅ Report JSON gerado corretamente
- ✅ Todos os eventos capturados
- ✅ Assinaturas listadas
- ✅ Integridade validada
- ✅ PDF legível
- ✅ Audit log registrado

**Arquivos:**
- `src/lib/xase/custody.ts`
- `src/app/api/xase/bundles/[bundleId]/custody/route.ts`
- `src/lib/templates/custody-report.html` (PDF template)

---

#### Ticket 2.3: PDF Legal Template (MVP)
**Prioridade:** 🔴 ALTA  
**Estimativa:** 8 pontos

**Descrição:**
Criar template PDF court-ready minimalista.

**Tarefas:**
- [ ] Escolher lib PDF (recomendado: `pdfkit` ou `puppeteer`)
- [ ] Criar `src/lib/xase/pdf-report.ts`
- [ ] Gerar hash LÓGICO (antes do render):
  - Hash do JSON/HTML base (conteúdo estruturado)
  - Armazenar como `pdfReportLogicalHash`
- [ ] Gerar hash BINÁRIO (após render):
  - Hash do PDF final
  - Armazenar como `pdfReportHash`
- [ ] Template court-ready:
  - **Capa:** "Evidence Report", bundleId, data
  - **Seção 1:** Identificação (claimNumber/policyNumber, tenant)
  - **Seção 2:** Timeline (decisão, snapshots, checkpoint)
  - **Seção 3:** Hashes principais (recordHash, inputHash, outputHash, checkpointHash)
  - **Seção 4:** Assinaturas (KMS, QTSP quando houver)
  - **Seção 5:** Chain of Custody (resumo)
  - **Seção 6:** Instruções de verificação (como rodar verify.js)
  - **Rodapé:** "Generated by Xase", timestamp, hash do PDF
- [ ] Função `generatePDFReport(bundleId)`:
  - Buscar bundle + records + insurance + custody
  - Gerar PDF
  - Upload S3
  - Calcular hash
  - Atualizar `EvidenceBundle` (pdfReportUrl, pdfReportHash)
  - Log audit
- [ ] Endpoint `POST /api/xase/bundles/:id/pdf`:
  - Trigger geração
  - Retornar URL + hash
- [ ] Testes

**Critérios de aceite:**
- ✅ PDF gerado e legível
- ✅ Todas as seções presentes
- ✅ Hash lógico + hash binário armazenados
- ✅ URL acessível
- ✅ Audit log registrado

**Arquivos:**
- `src/lib/xase/pdf-report.ts`
- `src/app/api/xase/bundles/[bundleId]/pdf/route.ts`
- `package.json` (adicionar `pdfkit` ou `puppeteer`)

---

#### Ticket 2.4: Verify API — Estender para Snapshots
**Prioridade:** 🟡 MÉDIA  
**Estimativa:** 3 pontos

**Descrição:**
Estender endpoint de verificação para validar snapshots.

**Tarefas:**
- [ ] Atualizar `src/app/api/xase/v1/verify/[id]/route.ts`
- [ ] Adicionar checks:
  - Snapshots existem?
  - Hashes dos snapshots batem?
  - Snapshots acessíveis (S3)?
- [ ] Retornar status detalhado:
  ```json
  {
    "valid": true,
    "checks": {
      "hashChainValid": true,
      "signatureValid": true,
      "snapshotsValid": true,
      "qtspValid": null // quando não houver
    },
    "details": {
      "snapshots": [
        {"type": "EXTERNAL_DATA", "valid": true, "hash": "..."},
        {"type": "BUSINESS_RULES", "valid": true, "hash": "..."}
      ]
    }
  }
  ```
- [ ] Testes

**Critérios de aceite:**
- ✅ Snapshots validados
- ✅ Status detalhado retornado
- ✅ Erros tratados (snapshot missing, hash mismatch)

**Arquivos:**
- `src/app/api/xase/v1/verify/[id]/route.ts`

---

### 🟡 SPRINT 3 (Semana 5-6) — QTSP Integration (UK/EU)

#### Ticket 3.1: QTSP Provider Interface
**Prioridade:** 🔴 ALTA  
**Estimativa:** 5 pontos

**Descrição:**
Criar interface pluggable para QTSP providers.

**Tarefas:**
- [ ] Criar `src/lib/xase/qtsp/interface.ts`
- [ ] Interface:
  ```typescript
  interface QTSPProvider {
    name: string;
    createQualifiedTimestamp(hashBytes: Buffer): Promise<QTSPTimestampResult>;
    verifyQualifiedTimestamp(token: string): Promise<QTSPVerifyResult>;
  }
  
  interface QTSPTimestampResult {
    token: string; // base64
    certChain: string; // PEM
    timestamp: Date;
    providerMeta: any;
  }
  
  interface QTSPVerifyResult {
    valid: boolean;
    timestamp: Date;
    certChain: string;
    error?: string;
  }
  ```
- [ ] Factory `getQTSPProvider(name)`:
  - Retorna provider configurado
  - Suporta: 'globalsign', 'mock'
- [ ] Mock provider (para dev/test)
- [ ] Testes

**Critérios de aceite:**
- ✅ Interface bem definida
- ✅ Factory funciona
- ✅ Mock provider funciona

**Arquivos:**
- `src/lib/xase/qtsp/interface.ts`
- `src/lib/xase/qtsp/factory.ts`
- `src/lib/xase/qtsp/mock.ts`

---

#### Ticket 3.2: GlobalSign QTSP Implementation
**Prioridade:** 🔴 ALTA  
**Estimativa:** 8 pontos

**Descrição:**
Implementar integração com GlobalSign QTSP.

**Tarefas:**
- [ ] Pesquisar API GlobalSign (docs, SDK)
- [ ] Criar `src/lib/xase/qtsp/globalsign.ts`
- [ ] Implementar `QTSPProvider`:
  - Autenticação (API key/cert)
  - `createQualifiedTimestamp()`:
    - Chamar API GlobalSign
    - Receber token RFC3161
    - Parsear cert chain
    - Retornar resultado
  - `verifyQualifiedTimestamp()`:
    - Validar estrutura token
    - Validar cert chain (X.509)
    - Validar timestamp
    - Retornar resultado
- [ ] Configuração via env:
  - `QTSP_PROVIDER=globalsign`
  - `GLOBALSIGN_API_KEY=...`
  - `GLOBALSIGN_API_URL=...`
- [ ] Rate limiting (se necessário)
- [ ] Retry logic (transient errors)
- [ ] Testes (mock HTTP)

**Critérios de aceite:**
- ✅ Timestamp criado via GlobalSign
- ✅ Token válido (RFC3161)
- ✅ Cert chain válida
- ✅ Verificação funciona
- ✅ Erros tratados

**Arquivos:**
- `src/lib/xase/qtsp/globalsign.ts`
- `.env.example` (adicionar vars)

---

#### Ticket 3.3: QTSP Checkpoint Job
**Prioridade:** 🔴 ALTA  
**Estimativa:** 5 pontos

**Descrição:**
Criar job para aplicar QTSP timestamp em checkpoints.

**IMPORTANTE:** QTSP carimba o **manifest.json** (lista de arquivos + hashes), não o ZIP inteiro.
Isso é padrão forense — o manifest é o "contrato criptográfico" do bundle.

**Tarefas:**
- [ ] Criar `src/lib/xase/jobs/timestamp-checkpoint.ts`
- [ ] Job `TIMESTAMP_CHECKPOINT_QTSP`:
  - Recebe `checkpointId`
  - Busca checkpoint
  - Calcula hash do **checkpointHash** (já existe)
  - Chama QTSP provider
  - Recebe token + cert chain
  - Atualiza `CheckpointRecord`:
    - `qtspProvider`
    - `qtspTimestampToken`
    - `qtspCertificateChain`
  - Log audit (CHECKPOINT_TIMESTAMPED)
- [ ] Integrar no cron checkpoint:
  - Após criar checkpoint
  - Enfileirar job QTSP
- [ ] Testes

**Nota:** Para bundles, QTSP carimba o `manifest.json` (implementado no Ticket 2.1).

**Critérios de aceite:**
- ✅ Job executa sem erros
- ✅ Token QTSP armazenado
- ✅ Cert chain armazenada
- ✅ Audit log registrado
- ✅ Retry em caso de falha

**Arquivos:**
- `src/lib/xase/jobs/timestamp-checkpoint.ts`
- `src/lib/xase/cron-checkpoint.ts` (atualizar)

---

#### Ticket 3.4: Verify Offline — QTSP Support
**Prioridade:** 🟡 MÉDIA  
**Estimativa:** 5 pontos

**Descrição:**
Atualizar script de verificação offline para validar QTSP tokens.

**Tarefas:**
- [ ] Atualizar `verify.js` template (em export.ts)
- [ ] Adicionar função `verifyQTSPToken(token, certChain)`:
  - Parsear token (ASN.1/DER)
  - Validar estrutura RFC3161
  - Validar cert chain (X.509)
  - Validar timestamp
  - Retornar valid/invalid
- [ ] Integrar no fluxo principal:
  - Se checkpoint tem QTSP token → validar
  - Imprimir resultado
- [ ] Adicionar dependências Node (se necessário):
  - `node-forge` ou `asn1js` para parsing
- [ ] Testes

**Critérios de aceite:**
- ✅ QTSP token validado offline
- ✅ Cert chain validada
- ✅ Output claro (VALID/INVALID)
- ✅ Funciona sem internet (validação estrutural)

**Arquivos:**
- `src/lib/xase/export.ts` (template verify.js)
- `package.json` (adicionar deps se necessário)

---

### 🟢 SPRINT 4 (Semana 7-8) — US Support & e-Discovery

#### Ticket 4.1: US TSA Integration (DigiCert)
**Prioridade:** 🟡 MÉDIA  
**Estimativa:** 5 pontos

**Descrição:**
Adicionar suporte a TSA (US) como alternativa/complemento ao QTSP.

**Tarefas:**
- [ ] Criar `src/lib/xase/tsa/digicert.ts`
- [ ] Implementar interface similar a QTSP:
  - `createTimestamp(hashBytes)` → token RFC3161
  - `verifyTimestamp(token)` → valid/invalid
- [ ] Configuração via env:
  - `TSA_PROVIDER=digicert`
  - `DIGICERT_TSA_URL=...`
- [ ] Integrar no checkpoint job (opcional, parametrizável)
- [ ] Testes

**Critérios de aceite:**
- ✅ TSA timestamp criado
- ✅ Token RFC3161 válido
- ✅ Verificação funciona

**Arquivos:**
- `src/lib/xase/tsa/digicert.ts`

---

#### Ticket 4.2: e-Discovery Export Format
**Prioridade:** 🟢 BAIXA  
**Estimativa:** 3 pontos

**Descrição:**
Adicionar formato de export específico para e-discovery.

**Tarefas:**
- [ ] Atualizar `POST /api/xase/bundles/create`
- [ ] Suportar `legalFormat: 'ediscovery'`
- [ ] Estrutura e-discovery:
  - Metadata XML (padrão EDRM)
  - Load file (CSV/DAT)
  - Native files (PDFs, JSON)
  - Hashes MD5 + SHA-256
- [ ] Documentação

**Critérios de aceite:**
- ✅ Bundle e-discovery gerado
- ✅ Formato compatível com ferramentas padrão
- ✅ Metadata XML válido

**Arquivos:**
- `src/lib/xase/export.ts`
- `docs/EDISCOVERY_FORMAT.md`

---

## �️ BACKWARD COMPATIBILITY & SAFETY

### Garantias de não-quebra

1. **Schema migrations são aditivas:**
   - Novos models (InsuranceDecision, EvidenceSnapshot) não afetam existentes
   - Novos campos em models existentes são NULLABLE
   - Índices novos não bloqueiam queries antigas

2. **APIs novas, não modificadas:**
   - `/api/xase/v1/insurance/ingest` é NOVO endpoint
   - `/api/xase/v1/records` (existente) continua funcionando
   - Bundles antigos continuam válidos (manifest é opcional inicialmente)

3. **Snapshots são opt-in:**
   - DecisionRecord sem snapshots continua válido
   - Ingestão antiga (sem snapshots) continua funcionando
   - Verificação funciona com ou sem snapshots

4. **QTSP é incremental:**
   - Checkpoints sem QTSP continuam válidos
   - Assinatura KMS (existente) é mantida
   - QTSP é adicionado, não substitui

5. **Bundles antigos permanecem verificáveis:**
   - verify.js antigo continua funcionando
   - verify.js novo é backward compatible
   - Manifest é adicionado, não obrigatório (inicialmente)

### Estratégia de rollout

- **Sprint 1:** Schema + APIs novas (zero impacto em produção)
- **Sprint 2:** Manifest opt-in (bundles antigos continuam válidos)
- **Sprint 3:** QTSP em checkpoints novos (antigos inalterados)
- **Sprint 4:** Features adicionais (zero breaking changes)

### Testes de regressão obrigatórios

Antes de cada deploy:
- [ ] Ingestão antiga (POST /api/xase/v1/records) funciona
- [ ] Verificação de records antigos funciona
- [ ] Bundles antigos continuam baixáveis
- [ ] verify.js de bundles antigos passa
- [ ] Checkpoints antigos continuam válidos

---

## �📊 RESUMO DE ESFORÇO

### Por Sprint

| Sprint | Tickets | Pontos | Semanas |
|--------|---------|--------|---------|
| Sprint 1 | 3 | 16 | 2 |
| Sprint 2 | 4 | 21 | 2 |
| Sprint 3 | 4 | 23 | 2 |
| Sprint 4 | 2 | 8 | 2 |
| **Total** | **13** | **68** | **8** |

### Por Prioridade

| Prioridade | Tickets | Pontos |
|------------|---------|--------|
| 🔴 CRÍTICA | 5 | 29 |
| 🔴 ALTA | 4 | 23 |
| 🟡 MÉDIA | 3 | 13 |
| 🟢 BAIXA | 1 | 3 |

---

## ✅ DEFINITION OF DONE (Geral)

Para cada ticket ser considerado "pronto":

1. **Código:**
   - [ ] Implementado conforme especificação
   - [ ] Code review aprovado
   - [ ] Sem warnings TypeScript
   - [ ] Formatado (Prettier)

2. **Testes:**
   - [ ] Testes unitários (cobertura > 80%)
   - [ ] Testes E2E (quando aplicável)
   - [ ] Todos os testes passando

3. **Documentação:**
   - [ ] JSDoc/TSDoc em funções públicas
   - [ ] README atualizado (se necessário)
   - [ ] Exemplos de uso (quando aplicável)

4. **Migração:**
   - [ ] Migração Prisma testada
   - [ ] Rollback testado
   - [ ] Dados de exemplo criados

5. **Deploy:**
   - [ ] Variáveis de ambiente documentadas
   - [ ] Configuração em staging testada
   - [ ] Logs/observability adicionados

---

## 🎯 MILESTONES

### M1: Insurance MVP (Sprint 1-2, 4 semanas)
- ✅ Schema completo
- ✅ Ingestão insurance funcional
- ✅ Snapshots armazenados
- ✅ Manifest + verify offline robusto
- ✅ Chain of Custody report
- ✅ PDF legal MVP

**Entrega:** Sistema capaz de ingerir decisões insurance e gerar prova verificável offline (fundamento sólido).

### M2: UK/EU Compliance (Sprint 3, 2 semanas)
- ✅ QTSP integration (GlobalSign)
- ✅ Qualified timestamps em checkpoints
- ✅ Verificação offline com QTSP

**Entrega:** Compliance UK/EU com eIDAS (qualified timestamps).

### M3: Production Ready (Sprint 4, 2 semanas)
- ✅ Bundle manifest completo
- ✅ US TSA support
- ✅ e-Discovery format
- ✅ Documentação completa

**Entrega:** Sistema production-ready para UK/US insurance.

---

## 🚀 PRÓXIMOS PASSOS IMEDIATOS

1. **Validar este plano** com time técnico
2. **Criar tickets** no Jira/Linear/GitHub Issues
3. **Estimar capacidade** do time (pontos/sprint)
4. **Iniciar Sprint 1** (Schema + Snapshots)
5. **Setup ambiente** (QTSP sandbox, S3 buckets)

---

**Preparado por:** Cascade AI  
**Data:** 4 de Janeiro de 2026  
**Status:** Pronto para execução  
**Próxima revisão:** Após Sprint 1
