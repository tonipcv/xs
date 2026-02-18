# XASE — De Voice Governance para Clinical Data Governance

> 18 fev 2026 — Análise completa: estado atual + gap + plano

---

## ESTADO ATUAL DO SISTEMA

### O que existe e funciona

| Camada | O que tem | Status |
|--------|----------|--------|
| **Brain (Next.js)** | 23 pages em `/app/*`, 86 API routes em `/api/v1/`, Prisma + PostgreSQL | Build falha (2 erros menores) |
| **Sidecar (Rust)** | Cache DashMap, Unix socket, prefetch, watermark FFT, telemetry, kill-switch | Compila, 14 tests pass |
| **SDK Python** | XaseClient, GovernedDataset, SidecarDataset, HuggingFace integration | Sem testes |
| **Infra** | K8s manifests, Terraform (AWS), CI/CD GitHub Actions | Faltam Dockerfile sidecar, Helm chart |

### O que é voice-specific (hardcoded)

| Componente | Voice-specific | Localização |
|-----------|---------------|-------------|
| **Schema Prisma** | `xase_voice_datasets`, `AudioSegment`, `VoiceAccessPolicy`, `VoiceAccessLog`, `VoiceAccessLease`, `VoiceAccessAction` | schema.prisma |
| **Dataset model** | `durationHours`, `sampleRate`, `codec`, `channelCount`, `avgSnr`, `speechRatio`, `overlapRatio`, `silenceRatio`, `emotionBand`, `callType` | Dataset, AudioSegment |
| **Watermark** | FFT spread-spectrum para WAV audio | sidecar/watermark.rs |
| **Audio processor** | WAV processing, SNR, speech ratio | lib/xase/audio-processor.ts, audio-worker.ts |
| **Sidecar** | Download → watermark WAV → serve via socket | Toda a pipeline |
| **PII detector** | Regex para nomes, CPF, telefone em texto | lib/ingestion/pii-detector.ts |
| **Compliance** | GDPR, BaFin, FCA, AI Act (genéricos, não HIPAA/LGPD-saúde) | lib/compliance/* |

### O que já é data-agnostic (reutilizável)

| Componente | Por que é agnóstico |
|-----------|-------------------|
| Auth + RBAC + Multi-tenancy | Funciona para qualquer tipo de dado |
| Policy engine + enforcement | Regras são JSON, não dependem de tipo |
| Lease lifecycle (create, extend, expire, revoke) | TTL genérico |
| Evidence Merkle tree | Hash de qualquer blob |
| Credit ledger + billing | Financeiro genérico |
| Consent manager | CRUD de consentimento genérico |
| Differential privacy (epsilon budget) | Aplicável a qualquer query |
| Cloud integrations (S3, GCS, Azure) | Storage agnóstico |
| Sidecar cache (DashMap) | Cacheia qualquer `Vec<u8>` |
| Sidecar socket server | Serve qualquer binário |
| API key management | Genérico |
| Audit trail (Prisma + ClickHouse) | Genérico |

**Conclusão: ~60% da infra é agnóstica. O gap é nos models, processamento, e compliance específicos de saúde.**

---

## GAP: O QUE FALTA PARA CLINICAL DATA GOVERNANCE

### 1. Schema — Generalizar Dataset para Multi-Modal

**Hoje**: Dataset = collection de AudioSegments com metadados de voz.
**Precisa**: Dataset = collection de DataAssets de qualquer tipo.

```
Novo conceito:

Dataset (container genérico)
├── DataAsset (unidade atômica de dado)
│   ├── type: AUDIO | IMAGE | TEXT | TIMESERIES | TABULAR
│   ├── format: WAV | DICOM | FHIR_JSON | HL7 | CSV | PARQUET | NIfTI
│   ├── sizeBytes, hash, storageKey
│   └── metadata: Json (flexível por tipo)
│
├── Metadata específica por tipo (via JSON):
│   ├── AUDIO: {sampleRate, codec, duration, snr, speechRatio}
│   ├── IMAGE/DICOM: {modality, bodyPart, studyDate, pixelSpacing, rows, cols, sopClassUid}
│   ├── TEXT/FHIR: {resourceType, patientRef, encounterDate, codeSystem}
│   ├── TIMESERIES: {signalType, samplingFreq, channels, duration}
│   └── TABULAR: {columns, rowCount, schema}
```

**Mudanças no Prisma**:
- Renomear `AudioSegment` → `DataAsset`
- Adicionar `enum DataType { AUDIO, IMAGE, TEXT, TIMESERIES, TABULAR }`
- Adicionar `enum DataFormat { WAV, MP3, DICOM, NIFTI, FHIR_JSON, HL7_V2, CSV, PARQUET }`
- Mover metadados voice-specific para `metadata Json`
- Renomear `VoiceAccessPolicy` → `AccessPolicy`
- Renomear `VoiceAccessLog` → `AccessLog`
- Renomear `VoiceAccessLease` → `AccessLease`
- Renomear `VoiceAccessAction` → `AccessAction`
- Adicionar campos médicos: `regulatoryFramework`, `deIdentificationLevel`, `hipaaCategory`

### 2. De-identification por Tipo de Dado

| Tipo | O que precisa | Complexidade |
|------|-------------|-------------|
| **DICOM (imagem)** | Remover DICOM tags com PII (PatientName, PatientID, InstitutionName), burn-in pixel anonymization | Média — libs existem (dcm4che, pydicom) |
| **FHIR/HL7 (prontuário)** | NER para de-identify nomes, datas, endereços, MRN; date-shifting; generalization | Alta — precisa NLP médico |
| **Séries temporais (ECG/EEG)** | Remover metadados de identificação, normalizar | Baixa |
| **Texto livre** | NER + regex para PII médico (MRN, SSN, nomes) | Média |
| **Áudio (voz)** | Já existe (watermark + PII removal) | Feito |

**No Sidecar Rust**: Adicionar módulos de de-id por tipo:
- `deidentify_dicom.rs` — strip DICOM tags, pixel anonymization
- `deidentify_fhir.rs` — JSON path redaction
- `deidentify_text.rs` — regex + NER proxy
- Manter `watermark.rs` para áudio

### 3. Compliance Médica

| Framework | Região | O que exige | Tem hoje? |
|-----------|--------|------------|-----------|
| **HIPAA** | EUA | PHI de-identification (Safe Harbor ou Expert Determination), BAA, audit trail, access controls | NÃO |
| **LGPD** (saúde) | Brasil | Consentimento específico para dados sensíveis (Art. 11), DPO, relatório de impacto | Parcial (GDPR genérico) |
| **ANVISA** | Brasil | RDC 546/2021 — SaMD (Software as Medical Device), rastreabilidade | NÃO |
| **EU MDR + AI Act** | Europa | Classificação de risco, documentação técnica, vigilância pós-mercado | Parcial (AI Act stub) |
| **GDPR** (saúde) | Europa | Art. 9 — dados de saúde = categoria especial, base legal explícita | Parcial |

**Adicionar**:
- `lib/compliance/hipaa.ts` — Safe Harbor 18 identifiers check, BAA tracking
- `lib/compliance/lgpd-health.ts` — Art. 11 consent, ROPA
- `lib/compliance/anvisa.ts` — SaMD classification
- Atualizar `AccessOffer` com campo `regulatoryFrameworks: String[]`

### 4. Sidecar — Processar Mais que WAV

**Hoje**: `s3_client.rs` baixa blob → `watermark.rs` aplica FFT em WAV → serve via socket.

**Precisa**: Pipeline configurável por tipo de dado.

```rust
// Novo pipeline no sidecar:
enum DataPipeline {
    Audio {
        watermark: bool,
        deidentify_pii: bool,
    },
    Dicom {
        strip_tags: Vec<String>,      // DICOM tags para remover
        pixel_anonymize: bool,         // Burn-in text removal
        watermark_metadata: bool,      // Watermark em metadados
    },
    Fhir {
        redact_paths: Vec<String>,     // JSON paths para redatar
        date_shift_days: Option<i32>,  // Date shifting
        generalize_age: bool,          // Age → age range
    },
    TimeSeries {
        strip_metadata: bool,
        normalize: bool,
    },
    Passthrough,                        // Serve raw (para dados já de-identified)
}
```

**Config via env ou API**:
```
DATA_PIPELINE=dicom
DICOM_STRIP_TAGS=PatientName,PatientID,InstitutionName
DICOM_PIXEL_ANONYMIZE=true
```

### 5. SDK Python — Suporte Multi-Modal

**Hoje**: `SidecarDataset` retorna `bytes` (WAV assumido).

**Precisa**:
```python
# Uso para imagens DICOM
dataset = SidecarDataset(
    socket_path="/var/run/xase/sidecar.sock",
    data_type="dicom",
    transform=dicom_to_tensor,  # Callback de transformação
)

# Uso para FHIR JSON
dataset = SidecarDataset(
    socket_path="/var/run/xase/sidecar.sock",
    data_type="fhir",
    transform=fhir_to_tokens,
)

# Uso para séries temporais
dataset = SidecarDataset(
    socket_path="/var/run/xase/sidecar.sock",
    data_type="timeseries",
    transform=ecg_to_tensor,
)
```

### 6. Frontend — Labels e Fluxos

**Mudanças de UX**:
- "Voice Dataset" → "Dataset" (já está parcialmente assim)
- Tipo de dado na criação: dropdown `Audio | Medical Image | Clinical Text | Time Series | Tabular`
- Filtros no marketplace por tipo de dado + regulatory framework
- Compliance dashboard: adicionar HIPAA, LGPD-saúde, ANVISA
- Dataset detail: preview adaptativo (player de áudio, viewer DICOM, JSON tree para FHIR)

---

## O QUE NÃO PRECISA MUDAR

| Componente | Por quê |
|-----------|---------|
| Auth, RBAC, multi-tenancy | Já é genérico |
| Lease lifecycle | TTL funciona para qualquer dado |
| Evidence + Merkle tree | Hash é agnóstico |
| Credit ledger + billing | Financeiro genérico |
| Sidecar cache (DashMap) | Cacheia `Vec<u8>` de qualquer tipo |
| Sidecar socket protocol | Length-prefixed binary, agnóstico |
| Prefetch loop | Baixa qualquer blob |
| Kill-switch + telemetry | Genérico |
| API key management | Genérico |
| Cloud integrations | S3/GCS/Azure servem qualquer arquivo |
| Policy engine | Regras JSON, agnóstico |
| Consent manager | Genérico |
| CI/CD | Genérico |

---

## PLANO DE EXECUÇÃO

### Fase 1: Generalizar Schema (1 semana)

1. **Prisma migration**: Renomear models voice-specific
   - `AudioSegment` → `DataAsset` + adicionar `dataType`, `dataFormat`, `metadata Json`
   - `VoiceAccessPolicy` → `AccessPolicy`
   - `VoiceAccessLog` → `AccessLog`
   - `VoiceAccessLease` → `AccessLease`
   - `VoiceAccessAction` → `AccessAction` + adicionar novos actions
   - `xase_voice_datasets` → `xase_datasets` (table rename)
   - `xase_voice_access_*` → `xase_access_*`

2. **Atualizar imports em todo o codebase** (~50 arquivos referenciam models antigos)

3. **Adicionar enum DataType e DataFormat**

4. **Adicionar campo `regulatoryFrameworks` no AccessOffer**

### Fase 2: Compliance Médica (1 semana)

1. `lib/compliance/hipaa.ts` — Safe Harbor check (18 identifiers)
2. `lib/compliance/lgpd-health.ts` — Art. 11 consent tracking
3. API routes: `/api/v1/compliance/hipaa/safe-harbor`, `/api/v1/compliance/lgpd/health-consent`
4. Atualizar dashboard de compliance com novos frameworks

### Fase 3: Sidecar Multi-Pipeline (2 semanas)

1. `sidecar/src/pipeline.rs` — trait `DataPipeline` com implementações por tipo
2. `sidecar/src/deidentify_dicom.rs` — DICOM tag stripping (usar `dicom-rs` crate)
3. `sidecar/src/deidentify_text.rs` — regex PII removal
4. Config via env: `DATA_PIPELINE=dicom|audio|fhir|passthrough`
5. Manter `watermark.rs` como pipeline específica de áudio
6. Testes para cada pipeline

### Fase 4: SDK + Frontend (1 semana)

1. SDK Python: `data_type` param no `SidecarDataset`
2. SDK Python: transforms padrão para DICOM, FHIR, ECG
3. Frontend: tipo de dado na criação de dataset
4. Frontend: marketplace filtros por tipo + compliance
5. Frontend: preview adaptativo por tipo

### Fase 5: Vertical Hospital (ongoing)

1. Conector PACS (DICOM) — via DICOMweb ou C-FIND/C-MOVE
2. Conector FHIR — REST client para EHR (Epic, Cerner, etc)
3. Conector HL7v2 — TCP MLLP listener
4. Templates de policy para saúde (HIPAA Safe Harbor preset, LGPD Art. 11 preset)
5. Evidence bundle formato para auditoria hospitalar

---

## IMPACTO NO TAM

| Mercado | Dado | TAM |
|---------|------|-----|
| Voice AI (atual) | Áudio de call centers, consultas | ~$2B |
| **Radiologia AI** | DICOM (CT, MRI, X-Ray) | ~$15B |
| **Clinical NLP** | Prontuários, relatórios médicos | ~$12B |
| **Wearables/ICU** | ECG, EEG, sinais vitais | ~$8B |
| **Pharma/Clinical Trials** | Dados tabulares de estudos | ~$20B |
| **Total Clinical Data** | Multimodal | **~$57B** |

---

## RESUMO: O QUE MUDAR

| Área | Mudanças | Esforço |
|------|---------|---------|
| **Prisma Schema** | Renomear 6 models, adicionar 2 enums, generalizar campos | 2-3 dias |
| **Imports no código** | ~50 arquivos com referências a models antigos | 1 dia |
| **Compliance** | 2 novos módulos (HIPAA, LGPD-saúde) | 3-4 dias |
| **Sidecar Rust** | Pipeline trait + DICOM de-id + text de-id | 1-2 semanas |
| **SDK Python** | data_type param + transforms | 2-3 dias |
| **Frontend** | Tipo de dado, filtros, previews | 3-4 dias |
| **Conectores saúde** | PACS/DICOM, FHIR, HL7 | 2-3 semanas |

**Total estimado: 5-6 semanas para MVP de Clinical Data Governance**

### Prioridade imediata (esta semana):
1. **Renomear schema** — tira "Voice" de tudo, generaliza
2. **Adicionar HIPAA compliance** — é o primeiro pedido de qualquer hospital
3. **Sidecar pipeline trait** — prepara para multi-tipo sem quebrar áudio
