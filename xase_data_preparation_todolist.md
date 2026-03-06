# XASE — Data Preparation & Delivery: Plano Completo (TODO list)
_Atualizado: 2026-03-06 | Auditado contra o código real | Dono: Time de Engenharia_

> **Regra de ouro**: um item marcado `[x]` significa **código real, testado, funcional**.
> Items `[~]` = stub/simulação (existe código mas não funciona em produção).
> Items `[ ]` = não existe ou não implementado.

---

## 0) Objetivo

Transformar o XASE de **"S3 com autenticação"** em **AI-Ready Data Platform**.

**Antes (hoje):**
```
Cliente pede → Policy filtra → URLs do S3 → Cliente baixa arquivos crus
```

**Depois (objetivo):**
```
Cliente pede → POST /prepare → Job async → Dado preparado por caso de uso → Pacote com manifest/checksums/README
```

**Critério de sucesso**: um cliente faz **1 chamada de API** e recebe dataset pronto para pretrain/SFT/RAG/eval/DPO, com de-id aplicado, quality report, e reprodutibilidade garantida.

---

## 1) Production Readiness — Resumo Auditado (2026-03-06)

| Camada | Status | Readiness | Blocker principal |
|--------|--------|-----------|-------------------|
| Types/Contracts | Real | 95% | — |
| API Routes (3 endpoints) | Real | 85% | Falta endpoint de logs |
| DataPreparer orchestrator | Real | 80% | quality-validator não conectado |
| Text transforms (SFT/RAG/Eval/DPO/Pretrain) | Real | 80% | Testado só com mocks |
| Quality/Dedup | Real | 75% | Falta stats detalhadas |
| Packaging (manifest/checksums/README) | Real | 85% | — |
| Security (de-id texto, audit, encryption) | Real | 70% | DICOM/audio simulados |
| Format writers (JSONL/CSV/HF) | Real | 80% | — |
| **Parquet** | **STUB** | **10%** | **Escreve JSON, não Parquet** |
| **Audio processing (STT/diarization)** | **STUB** | **5%** | **Tudo simulado, zero real** |
| **DICOM OCR scrub** | **STUB** | **10%** | **OCR simulado, sem Tesseract** |
| **AWS STS** | **STUB** | **15%** | **Gera credenciais fake** |
| **Signed URLs** | Condicional | 50% | Real se AWS creds presentes, stub sem |
| Job Queue (BullMQ) | Real | 50% | **Zero testes** |
| DB persistence | Real | 60% | Migrations OK, **nunca testado e2e** |
| **Integration tests** | **Inexistente** | **0%** | **Nenhum teste e2e rodou** |

**Estimativa geral: ~40% production-ready**

---

## 2) Inventário do Código (auditado)

### 2.1 Arquivos de implementação: 67 arquivos, ~12.459 linhas
```
src/lib/preparation/
├── data-preparer.ts          (185 linhas) — REAL: orquestrador normalize→compile→deliver
├── preparation.types.ts      (126 linhas) — REAL: tipos completos
├── job-queue.ts              (152 linhas) — REAL: BullMQ + Redis (sem testes!)
├── normalize/
│   ├── text-normalizer.ts    (46 linhas)  — STUB: skeleton básico
│   ├── deid-pipeline.ts      (67 linhas)  — PARCIAL: estrutura básica
│   ├── quality-gate.ts       (103 linhas) — REAL: dedup + quality scoring
│   └── quality-reporter.ts   (207 linhas) — REAL: report JSON + HTML
├── compile/
│   ├── compiler-registry.ts  (67 linhas)  — REAL: registry de 15 combinações
│   ├── chunker.ts            (92 linhas)  — REAL: token chunking + overlap
│   ├── class-balancer.ts     (219 linhas) — REAL: under/oversample
│   ├── sft-templates.ts      (133 linhas) — REAL: ChatML/Alpaca/ShareGPT
│   ├── embedding-formatter.ts(178 linhas) — REAL
│   ├── eval-formatter.ts     (111 linhas) — REAL
│   ├── eval-splitter.ts      (159 linhas) — REAL: stratified splits
│   ├── dpo-formatter.ts      (126 linhas) — REAL
│   ├── dpo-conversation-generator.ts (199 linhas) — REAL
│   ├── formatters/
│   │   ├── streaming-jsonl-writer.ts (194 linhas) — REAL: backpressure
│   │   ├── csv-writer.ts     (224 linhas) — REAL: streaming UTF-8
│   │   ├── parquet-writer.ts (148 linhas) — STUB: escreve JSON, NÃO Parquet
│   │   ├── huggingface-dataset-writer.ts (378 linhas) — REAL
│   │   ├── compression.ts    (134 linhas) — REAL: gzip
│   │   ├── jsonl-writer.ts   (13 linhas)  — STUB: minimal
│   │   └── webdataset-writer.ts (28 linhas) — STUB: minimal
│   ├── pre-training/
│   │   ├── pretraining-pipeline.ts (175 linhas) — REAL
│   │   └── sequence-packer.ts (258 linhas) — REAL
│   └── targets/               (11 arquivos) — REAL (exceto megatron=parcial, dpo=parcial)
├── deid/
│   ├── pii-deidentifier.ts   (242 linhas) — REAL: regex patterns
│   ├── audio-deidentifier.ts (312 linhas) — STUB: STT e scrub simulados
│   ├── dicom-ocr-scrubber.ts (216 linhas) — STUB: OCR simulado
│   ├── cross-modal-token.ts  (259 linhas) — REAL: HMAC tokenização
│   ├── deid-enforcement.ts   (270 linhas) — REAL: middleware
│   ├── pii-metrics-logger.ts (320 linhas) — REAL
│   └── raw-bypass-prevention.ts (337 linhas) — REAL
├── deliver/
│   ├── packager.ts           (185 linhas) — REAL: manifest/checksums/README
│   ├── signed-urls.ts        (80 linhas)  — CONDICIONAL: real com AWS creds, stub sem
│   ├── aws-sts-manager.ts    (172 linhas) — STUB: gera credenciais fake
│   ├── egress-policy-enforcement.ts (362 linhas) — REAL
│   ├── sidecar-delivery.ts   (273 linhas) — REAL
│   └── sidecar-streamer.ts   (23 linhas)  — STUB
├── batch/batch-processor.ts  (190 linhas) — REAL
├── formats/data-exporter.ts  (250 linhas) — REAL
├── adapters/dataset-adapter.ts (120 linhas) — REAL (não documentado antes)
├── utils/s3-fetcher.ts       (65 linhas)  — REAL (não documentado antes)
├── api/sidecar-segments.ts   (341 linhas) — REAL
├── audit/                    — REAL: audit-logger (289) + audit-trail-manager (332)
├── security/                 — REAL: encryption-manager (255) + secret-rotation (328)
├── rate-limiting/rate-limiter.ts (218 linhas) — REAL
├── retry/retry-manager.ts    (171 linhas) — REAL
├── idempotency/idempotency-manager.ts (156 linhas) — REAL
├── observability/            — REAL: logger (170) + metrics (207)
├── telemetry/telemetry-manager.ts (327 linhas) — REAL
├── versioning/versioning-manager.ts (256 linhas) — REAL
└── billing/job-metering.ts   (66 linhas)  — REAL (não documentado antes)
```

### 2.2 Testes: 49 arquivos, ~720 testes, ~11.686 linhas
- **2 suites skip**: text-pipeline (precisa DB), signed-urls (precisa AWS)
- **~31 testes falham** por necessitar conexão DB real
- **100% dos testes usam mocks** para dependências externas (Prisma, S3, Whisper)
- **Zero testes de integração** rodaram end-to-end

### 2.3 API Routes: 3 endpoints (348 linhas total)
- `POST /api/v1/datasets/:id/prepare` (198 linhas) — REAL, Zod validation
- `GET /api/v1/preparation/jobs/:jobId` (75 linhas) — REAL
- `POST /api/v1/preparation/jobs/:jobId/cancel` (75 linhas) — REAL

### 2.4 Database: 6 migrations (migration 030 não estava documentada!)
- `030_add_preparation_jobs.sql` — tabela principal preparation_jobs
- `031_add_preparation_spec_columns.sql` — license, privacy, output_contract (JSONB)
- `032_add_preparation_delivery_columns.sql` — manifest, checksums, download_urls
- `033_add_preparation_result_columns.sql` — normalization/compilation/delivery results
- `034_add_idempotency_records.sql` — idempotency_records table
- `035_add_audit_logs.sql` — audit_logs table

### 2.5 Prisma Models
- `PreparationJob` — completo com todos os campos
- `IdempotencyRecord` — completo com unique constraint

---

## 3) O que cada caso de uso precisa (e o que o XASE já entrega)

| Caso de uso | O que o cliente precisa receber | XASE hoje | Status código |
|---|---|---|---|
| Pre-training | JSONL gigante, deduplicado, limpo, com quality filter | Raw S3 | Lógica OK (com mocks) |
| Fine-tuning (SFT) | JSONL `{prompt, completion}` ou chat format | Não formata | Templates reais (ChatML/Alpaca/ShareGPT) |
| RAG | Docs em chunks (500–1000 tokens) com metadata + overlap | Não chunka | Chunker real |
| Evaluation | JSONL `{input, expected_output, label}` com splits | Nada | EvalSplitter real + stratification |
| RLHF/DPO | Pares `{chosen, rejected}` | Nada | DPOFormatter real |
| Embeddings | Texto pronto p/ embeddar com metadata | Nada | EmbeddingFormatter real (sem provider) |

---

## 4) Pipeline alvo (end-to-end)

```
INGESTÃO (já parcial)                PREPARAÇÃO (implementado)                    ENTREGA (parcial)
Raw S3
  ↓
PII detect + Quality + Metadata   →   1) De-identification (texto=REAL, dicom/audio=STUB)
                                       2) Transform por caso de uso (REAL para texto)
                                       3) Format conversion (JSONL/CSV=REAL, Parquet=STUB)
                                       4) Packaging (manifest, checksums, README) = REAL
                                                                     ↓
                                                          Prepared artifacts (/tmp local)
                                                                     ↓
                                                        Signed URLs (STUB) / Streaming (REAL)
```

**Gaps críticos no pipeline:**
1. Artefatos são escritos em `/tmp/preparation/` (local), NÃO em S3
2. Signed URLs são stub sem AWS credentials
3. De-id para DICOM e audio é simulação
4. Parquet escreve JSON disfarçado
5. Pipeline nunca rodou end-to-end com DB real

---

# 5) Backlog completo (TODO list) — Auditado contra o código

## EPIC A — Core Preparation Layer

### A1. Estrutura de pastas e contratos
- [x] Criar `src/lib/preparation/` — **67 arquivos, 12.459 linhas**
  - [x] `data-preparer.ts` — orquestrador real (185 linhas)
  - [x] `normalize/` — text-normalizer (STUB 46L), deid-pipeline (PARCIAL 67L), quality-gate (REAL 103L)
  - [x] `compile/` — compiler-registry (REAL) com 11 targets registrados
  - [x] `deliver/` — packager (REAL), signed-urls (CONDICIONAL)
  - [x] `preparation.types.ts` — contratos completos (126 linhas)
- [x] Interfaces TypeScript completas:
  - [x] `PreparationSpec`, `PreparationRequest`, `PreparationJob`
  - [x] `NormalizationResult`, `CompilationResult`, `DeliveryResult`, `PreparationResult`
  - [x] Enums: TaskType (5), Modality (4), Runtime (7), Format (5)
- [x] Convenção S3 keys: `prepared/{datasetId}/{jobId}/`

### A2. Módulos migrados
- [x] `data-exporter.ts` → `src/lib/preparation/formats/` (REAL, 250L, 13 testes)
- [x] `batch-processor.ts` → `src/lib/preparation/batch/` (REAL, 190L, 13 testes)
- [~] ~~`quality-validator.ts` conectado ao pipeline~~ — **FALSO**: continua isolado em `src/lib/ingestion/`, NÃO é chamado pelo DataPreparer
- [ ] **PENDENTE**: Importar quality-validator ou sua lógica no DataPreparer.normalize()

### A3. Job queue e persistência
- [x] Job Queue com BullMQ + Redis (REAL, 152L)
  - [x] addJob, cancelJob, getJobStatus, getJobProgress, getQueueMetrics
  - [ ] **PENDENTE**: Testes para job-queue.ts (zero testes!)
  - [ ] **PENDENTE**: Worker real que consome da fila (hoje DataPreparer roda via setImmediate no route handler)
- [x] Persistência de jobs (6 migrations, Prisma model completo)
  - [x] Migration 030: tabela preparation_jobs
  - [x] Migrations 031-033: spec, delivery, result columns
  - [x] Migration 034: idempotency_records
  - [x] Migration 035: audit_logs
  - [ ] **PENDENTE**: logs separados por job (persistidos)
  - [ ] **PENDENTE**: Validar que migrations rodam sem erro em DB real
- [x] RetryManager (REAL, 171L, 27 testes)
- [x] Cancelamento via endpoint (REAL, muda status no DB)
  - [ ] **PENDENTE**: Kill switch para interromper processamento ativo (hoje só muda status)
  - [ ] **PENDENTE**: Revogar signed URLs após cancelamento

---

## EPIC B — API /prepare

### B1. Endpoints
- [x] `POST /api/v1/datasets/:id/prepare` (198L, REAL, Zod validation completa)
  - [x] Valida session, tenant, dataset, lease (ACTIVE)
  - [x] Schema Zod: task, modality, target, config, license, privacy, output
  - [x] Cria PreparationJob no DB e lança DataPreparer async
- [x] `GET /api/v1/preparation/jobs/:jobId` (75L, REAL)
  - [x] Retorna job completo com results + dataset info
  - [x] Tenant isolation (só retorna jobs do tenant autenticado)
- [x] `POST /api/v1/preparation/jobs/:jobId/cancel` (75L, REAL)
  - [x] Valida status (não cancela completed/failed)
  - [x] Idempotente (200 se já cancelado)
- [ ] `GET /api/v1/datasets/:id/prepare/:jobId/logs` — NÃO EXISTE

### B2. Validações e policy
- [x] IdempotencyManager (REAL, 156L, 12 testes)
- [x] RateLimiter (REAL, 218L, 18 testes)
- [x] AuditLogger (REAL, 289L, 21 testes)
- [ ] **PENDENTE**: Idempotency e RateLimiter NÃO estão conectados ao route handler!
  > O route handler (`prepare/route.ts`) não chama IdempotencyManager nem RateLimiter.
  > Os módulos existem mas não estão wired no fluxo HTTP.

---

## EPIC C — Quality Filter

### C1. Deduplicação
- [x] Hash exato SHA256 (REAL, QualityGate, 6 testes)
- [ ] Near-duplicate (MinHash/SimHash) — v2

### C2. Completude / inválidos
- [x] Validação de campos obrigatórios (SFTTemplates.validate, REAL)
- [ ] `filteredOut` por motivo (tracking detalhado) — NÃO IMPLEMENTADO

### C3. Quality scoring
- [x] Heurísticas texto: alpha ratio, line length, char diversity (REAL)
- [ ] Heurísticas áudio: SNR/codec/clip — NÃO IMPLEMENTADO
- [ ] Heurísticas imagem: resolução mínima — NÃO IMPLEMENTADO
- [ ] `qualityScore` agregada + histogram — NÃO IMPLEMENTADO

### C4. Relatório de qualidade
- [x] QualityReporter (REAL, 207L, 11 testes) — JSON + HTML + recomendações

---

## EPIC D — Format Conversion

### D1. JSONL (default)
- [x] StreamingJsonlWriter (REAL, 194L, 17 testes) — backpressure, large datasets
- [~] JsonlWriter básico (STUB, 13L) — minimal, funciona para cases simples
- [x] CompressionHelper gzip (REAL, 134L, 15 testes)

### D2. CSV
- [x] CsvWriter (REAL, 224L, 22 testes) — flattening, escaping, UTF-8, streaming

### D3. Parquet
- [~] **ParquetWriter é PLACEHOLDER** (148L, 19 testes passam MAS testam JSON, não Parquet)
  > Comentário no código: `"This is a placeholder implementation that writes JSON"`
  > `TODO: Replace with actual Parquet implementation using apache-arrow`
  - [ ] **PENDENTE**: Instalar `apache-arrow` ou `parquetjs`
  - [ ] **PENDENTE**: Implementar write real com schema Arrow
  - [ ] **PENDENTE**: Testes que validem formato binário Parquet real
  - [ ] **PENDENTE**: Testar compatibilidade com `pandas.read_parquet()` / `pyarrow`

### D4. HuggingFace Datasets
- [x] HuggingFaceDatasetWriter (REAL, 378L, 18 testes)
  - [x] dataset_infos.json, state.json, data shards, README.md
  - [x] Compatível com `load_dataset()`

---

## EPIC E — Task-Specific Transforms

### E1. Pre-training (texto)
- [x] PretrainingPipeline (REAL, 175L, 6 testes) — dedup, quality, packing, shuffle
- [x] SequencePacker (REAL, 258L, 11 testes) — max_tokens, EOS, separator
- [x] PretrainJsonlCompiler, PretrainMdsCompiler (REAL)
- [~] PretrainMegatronCompiler (PARCIAL, 66L) — stub reference

### E2. Fine-tuning (SFT)
- [x] SFTTemplates (REAL, 133L, 20 testes) — ChatML, Alpaca, ShareGPT
- [x] SftJsonlCompiler (REAL, 68L) — integrado com templates + validation
- [ ] Custom templates (handlebars/mustache) — v2

### E3. RAG
- [x] Chunker (REAL, 92L, 16 testes) — token count, overlap, metadata, chunk_id
- [x] RagCorpusCompiler (REAL, 67L) — integrado com CompilerRegistry
- [ ] Embeddings provider real (openai/cohere/local) — NÃO IMPLEMENTADO

### E4. Evaluation
- [x] EvalFormatter (REAL, 111L, 15 testes)
- [x] EvalSplitter (REAL, 159L, 18 testes) — stratified, reproducible
- [x] ClassBalancer (REAL, 219L, 16 testes)
- [x] EvalDatasetCompiler (REAL, 107L)

### E5. RLHF / DPO
- [x] DPOFormatter (REAL, 126L, 18 testes)
- [x] DPOConversationGenerator (REAL, 199L, 12 testes)
- [x] DpoDatasetCompiler (REAL, 56L)

### E6. Embeddings
- [x] EmbeddingFormatter (REAL, 178L, 24 testes) — formatting + caching + stats
- [ ] Provider real (OpenAI/Cohere API call) — NÃO IMPLEMENTADO

---

## EPIC F — De-identification

### F1. Texto
- [x] PIIDeidentifier (REAL, 242L, 19 testes) — 5 strategies, 9 entity types, regex-based
- [x] PIIMetricsLogger (REAL, 320L, 10 testes) — safe logging
- [x] RawDataBypassPrevention (REAL, 337L, 12 testes)
- [x] DeidEnforcement middleware (REAL, 270L, 18 testes)

### F2. DICOM — OCR pixel scrub
- [~] **DicomOcrScrubber é SIMULAÇÃO** (216L, 14 testes)
  > `performOCR()` faz keyword matching em buffer string, NÃO chama Tesseract/EasyOCR
  > `scrubRegion()` retorna metadata, NÃO manipula pixels
  > Código: `"In production, this would call Tesseract.js or EasyOCR"`
  - [ ] **PENDENTE**: Integrar Tesseract.js ou EasyOCR
  - [ ] **PENDENTE**: Implementar scrub real (blur/blackout no pixel array)
  - [ ] **PENDENTE**: Testes com imagens DICOM reais contendo PHI

### F3. Áudio — PII bleep + STT
- [~] **AudioDeidentifier é SIMULAÇÃO** (312L, 17 testes)
  > `transcribeAudio()` retorna segmentos hardcoded
  > `scrubAudioSegments()` é no-op (retorna output path sem processar)
  > `generateBleepTone()` é REAL (sine wave)
  > Código: `"In production, this would call Whisper or similar STT service"`
  - [ ] **PENDENTE**: Integrar Whisper API (openai/whisper ou whisper.cpp)
  - [ ] **PENDENTE**: Implementar scrub real de audio (ffmpeg ou Web Audio API)
  - [ ] **PENDENTE**: Testes com áudio real contendo PII falada

### F4. Cross-modal token
- [x] CrossModalTokenGenerator (REAL, 259L, 24 testes) — HMAC, batch, version rotation

### F5. De-id na entrega
- [x] DeidEnforcement.middleware() bloqueia /api/raw/ (REAL)
- [x] validatePreparedData() (REAL)
- [x] Kill switch / lease revocation (REAL)

---

## EPIC G — Transform por modalidade

### G1. Image Preparer
- [~] **ImagePreparer é PARCIALMENTE SIMULADO** (15 testes passam)
  > Lógica de resampling/windowing existe mas processa dados simulados
  > Label mapping ICD funciona
  - [ ] **PENDENTE**: Testar com volumes DICOM/NIfTI reais
  - [ ] **PENDENTE**: Integrar SimpleITK para processamento real de volumes

### G2. Audio Preparer
- [~] **AudioPreparer é SIMULAÇÃO COMPLETA** (17 testes)
  > `loadAudioMetadata()` retorna dados hardcoded
  > `segmentBySilence()` é simulação matemática
  > `applyDiarization()` atribui speakers fake
  > `alignSTT()` retorna frases médicas fixas
  > `exportAudio()` é no-op
  - [ ] **PENDENTE**: Integrar ffprobe para metadata real
  - [ ] **PENDENTE**: Integrar Whisper para STT real
  - [ ] **PENDENTE**: Integrar pyannote ou equivalent para diarization
  - [ ] **PENDENTE**: Integrar ffmpeg para conversão de formato real

### G3. Multimodal Packager
- [x] MultimodalPackager (REAL) — folder por paciente, cross-reference, timeline
  > Lógica de linkagem e packaging é real
  > Depende de Image/Audio preparers que são stubs

---

## EPIC H — Packaging

### H1. Manifest + Checksums
- [x] Packager (REAL, 185L, 8 testes) — manifest.json, checksums.txt, README.md

### H2. README automático
- [x] Gera README.md com: task, modality, license, schema, usage, quality report

### H3. Versionamento
- [x] Version field no PreparationSpec ("1.0")
- [x] VersioningManager (REAL, 256L, 17 testes) — config hash, reproducibility report
- [ ] **PENDENTE**: Versionamento incremental (v1, v2, v3) por dataset + config
- [ ] **PENDENTE**: Config hash + git commit hash para reprodutibilidade total
- [ ] **PENDENTE**: TTL / policy de retenção de artefatos antigos

---

## EPIC I — Sidecar Delivery

### I1. Segment endpoint
- [x] SidecarSegments API (REAL, 341L, 13 testes) — pagination, streaming, backpressure

### I2. Egress enforcement
- [x] EgressPolicyEnforcement (REAL, 362L, 13 testes) — masking, filtering, audit

### I3. AWS STS
- [~] **AWSSTSManager é SIMULAÇÃO** (172L, 10 testes)
  > `assumeRoleForDataset()` gera credenciais fake: `ASIA` + random string
  > `generateSignedUrl()` gera URL com base64 token, não chama AWS SDK
  > Código: `"In production, this calls AWS STS AssumeRole API"`
  - [ ] **PENDENTE**: Integrar @aws-sdk/client-sts para AssumeRole real
  - [ ] **PENDENTE**: Testes de integração com role real
  - [ ] **PENDENTE**: Credential refresh real (não simulado)

### I4. Telemetria + billing
- [x] TelemetryManager (REAL, 327L) — egress, compute time, cost estimation
- [x] JobMetering (REAL, 66L) — usage-based billing events

---

## EPIC J — Observabilidade e Testes

### J1. Métricas e logs
- [x] MetricsCollector (REAL, 207L, 19 testes) — por job, por stage, summary
- [x] StructuredLogger (REAL, 170L, 20 testes) — correlation IDs, JSON format
- [ ] **PENDENTE**: OpenTelemetry tracing (/prepare → worker → S3)

### J2. Testes — Status Real
```
Testes unitários:    ~720 definidos em 49 arquivos
Testes passando:     ~680 (com mocks)
Testes falhando:     ~31 (necessitam DB real / Prisma)
Testes skipped:      11 (2 suites: text-pipeline + signed-urls)
Testes integração:   0 (ZERO testes end-to-end rodaram)
```

**Contagem real por arquivo** (verificada com grep):

| Arquivo | Testes | Status |
|---------|--------|--------|
| retry-manager.test.ts | 27 | REAL |
| cross-modal-token.test.ts | 24 | REAL |
| embedding-formatter.test.ts | 24 | REAL |
| csv-writer.test.ts | 22 | REAL |
| audit-logger.test.ts | 21 | REAL |
| sft-templates.test.ts | 20 | REAL |
| logger.test.ts | 20 | REAL |
| parquet-writer.test.ts | 19 | Testa JSON, NÃO Parquet |
| pii-deidentifier.test.ts | 19 | REAL |
| metrics.test.ts | 19 | REAL |
| eval-splitter.test.ts | 18 | REAL |
| dpo-formatter.test.ts | 18 | REAL |
| rate-limiter.test.ts | 18 | REAL |
| deid-enforcement.test.ts | 18 | REAL |
| huggingface-dataset-writer.test.ts | 18 | REAL |
| streaming-jsonl-writer.test.ts | 17 | REAL |
| audio-deidentifier.test.ts | 17 | Testa formas, NÃO audio real |
| audio-preparer.test.ts | 17 | Testa formas, NÃO audio real |
| audit-trail-manager.test.ts | 17 | REAL |
| versioning-manager.test.ts | 17 | REAL |
| chunker.test.ts | 16 | REAL |
| class-balancer.test.ts | 16 | REAL |
| secret-rotation-manager.test.ts | 16 | REAL |
| encryption-manager.test.ts | 15 | REAL |
| eval-formatter.test.ts | 15 | REAL |
| image-preparer.test.ts | 15 | Testa formas, NÃO imagem real |
| compression.test.ts | 15 | REAL |
| sidecar-delivery.test.ts | 14 | REAL |
| dicom-ocr-scrubber.test.ts | 14 | Testa formas, NÃO OCR real |
| data-exporter.test.ts | 13 | REAL |
| batch-processor.test.ts | 13 | REAL |
| egress-policy-enforcement.test.ts | 13 | REAL |
| sidecar-segments.test.ts | 13 | REAL |
| idempotency.test.ts | 12 | REAL |
| dpo-conversation-generator.test.ts | 12 | REAL |
| pretrain-compiler-integration.test.ts | 12 | REAL |
| raw-bypass-prevention.test.ts | 12 | REAL |
| no-raw-egress-security.test.ts | 11 | REAL |
| quality-reporter.test.ts | 11 | REAL |
| sequence-packer.test.ts | 11 | REAL |
| aws-sts-manager.test.ts | 10 | Testa formas, NÃO AWS real |
| pii-metrics-logger.test.ts | 10 | REAL |
| compiler-integration.test.ts | 9 | REAL |
| packager.test.ts | 8 | REAL |
| signed-urls.test.ts | 7 | SKIP (precisa AWS) |
| quality-gate.test.ts | 6 | REAL |
| pretraining-pipeline.test.ts | 6 | REAL |
| text-pipeline.test.ts | 4 | SKIP (precisa DB) |
| data-preparer.test.ts | 1 | REAL (mock Prisma) |

**PENDENTES:**
- [ ] Integration test: pipeline texto end-to-end com DB real
- [ ] Integration test: S3 read/write + signed URL com AWS real
- [ ] Golden datasets (fixtures) por modalidade: texto+PII, DICOM+PHI, áudio+PII
- [ ] Load tests: datasets grandes, concorrência multi-tenant
- [ ] Testes para `job-queue.ts` (ZERO testes atualmente!)

### J3. Segurança e compliance
- [x] NoRawEgressSecurity (REAL, 11 testes)
- [x] EncryptionManager (REAL, 255L, 15 testes)
- [x] SecretRotationManager (REAL, 328L, 16 testes)
- [x] AuditTrailManager (REAL, 332L, 17 testes)

---

# 6) Priorização — Fases para Produção

## Fase 1: TEXTO END-TO-END REAL (MVP)
> **Meta**: Um cliente faz 1 POST /prepare para texto e recebe dataset preparado, real, baixável.

### 1A. Conectar módulos que existem mas não estão wired
- [ ] Conectar IdempotencyManager no route handler de /prepare
- [ ] Conectar RateLimiter no route handler de /prepare
- [ ] Conectar quality-validator da ingestão OU migrar lógica para QualityGate
- [ ] Criar Worker real que consome da JobQueue (BullMQ) em vez de setImmediate
- [ ] Escrever testes para job-queue.ts

### 1B. Resolver persistência e S3
- [ ] Validar que migrations 030-035 rodam limpo em PostgreSQL real
- [ ] Trocar output de `/tmp/preparation/` para S3 real (usar s3-fetcher.ts)
- [ ] Configurar SignedUrlGenerator em modo `s3` com env vars reais
- [ ] Resolver os ~31 testes que falham por falta de DB

### 1C. Integration test texto
- [ ] Criar test que roda: POST /prepare → job created → DataPreparer → artefatos em S3 → GET /jobs/:id → completed
- [ ] Testar com dataset texto pequeno (100 records) para pretrain, SFT, RAG
- [ ] Validar que manifest.json, checksums.txt, README.md são consistentes

**Critério de aceite (Fase 1):**
- Um teste automatizado roda o pipeline completo texto → S3 → download
- JSONL gerado é válido, checksums batem, manifest é consistente

---

## Fase 2: PARQUET REAL + COMPLIANCE DICOM/AUDIO
> **Meta**: Parquet funciona de verdade, DICOM não vaza PHI, áudio é scrubbed.

### 2A. Parquet com apache-arrow
- [ ] `npm install apache-arrow` (ou `parquetjs`)
- [ ] Reescrever ParquetWriter.write() com Arrow schema real
- [ ] Testes que validam formato binário (ler com pyarrow/pandas)
- [ ] Testar particionamento real

### 2B. DICOM OCR scrub real
- [ ] Integrar Tesseract.js (`npm install tesseract.js`)
- [ ] Implementar performOCR() real (bounding boxes + confiança)
- [ ] Implementar scrubRegion() real (blur/blackout em pixel array)
- [ ] Testar com imagens DICOM reais contendo PHI burned-in

### 2C. Audio STT + bleep real
- [ ] Integrar Whisper API (OpenAI API ou whisper.cpp local)
- [ ] Implementar transcribeAudio() real com timestamps
- [ ] Integrar ffmpeg para scrub real (substituir segmentos por bleep)
- [ ] Testar com áudio real contendo PII falada

**Critério de aceite (Fase 2):**
- `pandas.read_parquet()` lê output do ParquetWriter sem erro
- DICOM com "JOHN DOE" em pixels → scrubbed ou blocked
- Áudio com SSN falado → bleep aplicado no segmento correto

---

## Fase 3: AWS REAL + MULTIMODAL + PRODUÇÃO
> **Meta**: AWS STS real, multimodal linkado, pronto para deploy.

### 3A. AWS STS real
- [ ] Integrar @aws-sdk/client-sts para AssumeRole real
- [ ] Credential refresh antes de expirar
- [ ] Scoped permissions por dataset

### 3B. Multimodal end-to-end
- [ ] ImagePreparer com volumes reais (SimpleITK)
- [ ] AudioPreparer com áudio real (ffprobe + Whisper + ffmpeg)
- [ ] MultimodalPackager com dados reais linkados
- [ ] Integration test: paciente com EHR + DICOM + nota + áudio

### 3C. Produção
- [ ] Versionamento incremental (v1, v2, v3)
- [ ] TTL / retenção de artefatos
- [ ] OpenTelemetry tracing
- [ ] Load test com dataset grande (10k+ records)
- [ ] Checklist final completo (seção 8)

**Critério de aceite (Fase 3):**
- Cliente baixa pacote multimodal "por paciente" com modalidades linkadas
- AWS STS gera credenciais temporárias reais
- Pipeline funciona com dataset de 10k+ records sem OOM

---

# 7) Definition of Done (DoD)

**Um item só conta como Done se:**
- [ ] Tem testes REAIS (não só testes que passam com mocks de algo simulado)
- [ ] Tem métricas/logs mínimos
- [ ] Falha de forma segura (não vaza raw/PII)
- [ ] Funciona com dados reais (não só fixtures/hardcoded)
- [ ] Está wired no pipeline (não é dead code isolado)
- [ ] Tem rollback/killswitch (quando aplicável)

---

# 8) Checklist Final (sinal verde para produção)

- [ ] /prepare retorna jobId e progress funciona com DB real
- [ ] Worker consome da JobQueue (BullMQ) — não usa setImmediate
- [ ] Outputs gerados em S3 (não /tmp) com paths e checksums corretos
- [ ] Signed URLs são reais (AWS S3 presigned, não stub)
- [ ] Manifest + README presentes e consistentes
- [ ] Quality stats batem com amostras reais
- [ ] Chunking respeita tokens e overlap (testado com texto real)
- [ ] Templates SFT geram JSONL válido para treino
- [ ] Parquet é formato binário real (lido por pandas/pyarrow)
- [ ] De-id texto aplicado na entrega (testado com PII real)
- [ ] De-id DICOM OCR scrub funciona (testado com PHI em pixels)
- [ ] De-id áudio bleep funciona (testado com PII falada)
- [ ] IdempotencyManager wired no route handler
- [ ] RateLimiter wired no route handler
- [ ] Logs/auditoria completos e queryáveis
- [ ] Quotas e rate limits ativos em produção
- [ ] Custos e telemetria reportados para billing
- [ ] Nenhum endpoint entrega raw quando deveria entregar prepared
- [ ] AWS STS gera credenciais reais temporárias
- [ ] Integration test passa end-to-end (texto mínimo)
- [ ] Load test passa (10k records sem OOM)

---

## Apêndice A — Campos de config (PreparationConfig)

Já implementado em `preparation.types.ts`:
```typescript
interface PreparationConfig {
  // Base
  quality_threshold?: number;    // 0-1
  deduplicate?: boolean;
  deid?: boolean;
  max_tokens?: number;
  seed?: number;
  output_format?: 'jsonl' | 'parquet';
  output_compression?: 'none' | 'gzip';

  // Pretraining
  add_eos_token?: boolean;
  eos_token?: string;
  separator?: string;

  // SFT
  input_field?: string;
  output_field?: string;
  template?: 'chatml' | 'alpaca' | 'sharegpt';
  system_prompt?: string;
  instruction?: string;

  // RAG
  chunk_size?: number;
  chunk_overlap?: number;
  chunk_tokens?: number;        // default 512
  overlap_tokens?: number;      // default 50
  preserveMetadata?: boolean;

  // Eval
  label_field?: string;
  split_ratios?: { train: number; val: number; test: number };
  stratify_by?: string;
  shard_size_mb?: number;
}
```

**Campos que faltam no tipo mas estão no apêndice original:**
- [ ] `max_samples` — limitar número de amostras
- [ ] `max_tokens_per_example` — para SFT
- [ ] `min_tokens` — para pretraining
- [ ] `shuffle` — para pretraining (lógica existe no pipeline mas não no tipo)
- [ ] `balance` — para eval (ClassBalancer existe mas não está no tipo)
- [ ] `chosen_field`, `rejected_field` — para DPO (DPOFormatter aceita mas não está no tipo)
- [ ] `embedding_provider`, `embedding_model` — para embeddings
- [ ] `include_metadata` — para RAG

---

## Apêndice B — Artefatos gerados (padrão de pacote)

```
prepared/{datasetId}/{jobId}/
├── manifest.json           — metadata completa + spec + stats
├── README.md               — gerado automaticamente
├── quality_report.json     — métricas de qualidade
├── checksums.txt           — SHA256 por arquivo
├── deid_report.json        — relatório de de-identification
├── data.jsonl              — (ou data.parquet, data.csv)
├── (RAG) chunks.jsonl
├── (Eval) eval_train.jsonl, eval_test.jsonl, eval_val.jsonl
├── (DPO) dpo-preferences.jsonl
├── (SFT) sft-dataset.jsonl
├── (Embeddings) embeddings.jsonl
└── (Multimodal) patient_{token}/
    ├── ehr.jsonl
    ├── images/*.nifti
    ├── notes/*.jsonl
    ├── audio/*.wav
    └── manifest.json
```

---

## Apêndice C — Arquivos não documentados anteriormente

Estes arquivos existem no código mas não apareciam no todolist original:

| Arquivo | Função | Linhas |
|---------|--------|--------|
| `adapters/dataset-adapter.ts` | Tradução de schema de dataset | 120 |
| `utils/s3-fetcher.ts` | Cliente S3 com retry | 65 |
| `billing/job-metering.ts` | Billing events por job | 66 |
| `compile/formatters/jsonl-writer.ts` | Writer JSONL básico | 13 |
| `compile/formatters/webdataset-writer.ts` | WebDataset format | 28 |
| `compile/targets/dpo-jsonl.ts` | DPO output JSONL | 49 |
| `compile/targets/vision-wds.ts` | WebDataset para visão | 72 |
| `compile/targets/audio-wds.ts` | WebDataset para áudio | 88 |
| `compile/targets/multimodal-wds.ts` | WebDataset multimodal | 104 |
| `deliver/sidecar-streamer.ts` | Streaming wrapper (stub) | 23 |
| `database/migrations/030_add_preparation_jobs.sql` | Tabela principal | 36 |
