# Xase Hybrid Billing System - Complete Documentation

## Executive Summary

Sistema de precificação **Hybrid** (assinatura base + uso variável) para escalar revenue alinhado com custos de AI e capturar expansão orgânica. Modelo projetado para viabilizar valuation bilionária com NDR >130% e margens sustentáveis.

**Modelo:** Base mensal por hospital/tenant + overage por unidade técnica (DICOM images, FHIR resources, audio minutes, text pages).

**Enforcement:** JWT com quotas + métricas Prometheus + billing automatizado.

---

## 1. Arquitetura do Sistema

### 1.1. Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                         Brain (Vercel)                       │
│  - Emissão de JWT (RS256) com quotas/features               │
│  - JWKS endpoint (/.well-known/jwks.json)                   │
│  - Billing Report API (/api/billing-report)                 │
│  - Job diário de coleta de métricas                          │
│  - Persistência em BillingSnapshot (Postgres)                │
└─────────────────────────────────────────────────────────────┘
                              ↓ JWT (1h TTL)
┌─────────────────────────────────────────────────────────────┐
│                    Sidecar (Hospital On-Prem)                │
│  - Validação JWT via JWKS                                    │
│  - Enforcement de quotas (429 quando excedido)               │
│  - Métricas Prometheus enriquecidas:                         │
│    • xase_dicom_images_processed_total                       │
│    • xase_fhir_resources_processed_total                     │
│    • xase_audio_minutes_processed_total                      │
│    • xase_text_pages_processed_total                         │
│    • xase_bytes_processed_total                              │
│    • xase_redactions_total                                   │
│  - Endpoint /ready com billing_counters                      │
└─────────────────────────────────────────────────────────────┘
```

### 1.2. Fluxo de Dados

1. **Provisionamento:**
   - Admin cria tenant no Brain.
   - Brain emite JWT com quotas/features para Sidecar.
   - Sidecar valida JWT via JWKS e armazena claims.

2. **Operação:**
   - Sidecar processa dados (DICOM/FHIR/Audio/Text).
   - Incrementa contadores Prometheus por pipeline.
   - Valida quotas antes de processar (retorna 429 se excedido).

3. **Billing:**
   - Job diário (00:00 UTC) coleta /ready de todos Sidecars.
   - Persiste snapshot em BillingSnapshot (Postgres).
   - Endpoint /api/billing-report gera relatório mensal (JSON/CSV).

---

## 2. Modelo de Precificação

### 2.1. Estrutura Hybrid

| Componente | Descrição | Valor Exemplo |
|------------|-----------|---------------|
| **Base Mensal** | Acesso ao Brain, Sidecar, suporte, atualizações | R$ 15.000/mês |
| **DICOM Images** | Por 1.000 imagens processadas | R$ 50 |
| **FHIR Resources** | Por 1.000 recursos processados | R$ 20 |
| **Audio Minutes** | Por 100 minutos processados | R$ 80 |
| **Text Pages** | Por 1.000 páginas/documentos | R$ 15 |

### 2.2. Exemplo de Fatura Mensal

**Hospital São Lucas - Fevereiro 2026**

| Item | Quantidade | Preço Unitário | Total |
|------|------------|----------------|-------|
| Base Subscription | 1 mês | R$ 15.000 | R$ 15.000 |
| DICOM Images | 1.200k (1.2k pacotes) | R$ 50/1k | R$ 60.000 |
| FHIR Resources | 300k (300 pacotes) | R$ 20/1k | R$ 6.000 |
| Audio Minutes | 4.500 min (45 pacotes) | R$ 80/100min | R$ 3.600 |
| Text Pages | 0 | R$ 15/1k | R$ 0 |
| **Total** | | | **R$ 84.600** |

### 2.3. Quotas e Limites

Cada tenant tem quotas mensais definidas no JWT:

```json
{
  "quotas": {
    "max_bytes_month": 1000000000000,
    "max_images_month": 2000000,
    "max_audio_minutes_month": 100000,
    "max_fhir_resources_month": 500000
  }
}
```

Quando quota é excedida:
- Sidecar retorna HTTP 429 (Too Many Requests).
- Métrica `xase_quota_exceeded_total` incrementa.
- Brain envia alerta ao tenant.

---

## 3. Implementação Técnica

### 3.1. Brain - Emissão de JWT

**Endpoint:** `POST /api/sidecar/token`

**Request:**
```json
{
  "tenant_id": "tenant_hospital_sao_lucas",
  "contract_id": "contract_abc123",
  "session_id": "session_xyz",
  "scopes": ["ingest:read", "redact:execute", "metrics:write"],
  "features": {
    "dicom_ocr": true,
    "fhir_nlp": false,
    "audio_redaction": true,
    "prefetch": true
  },
  "quotas": {
    "max_bytes_month": 1e12,
    "max_images_month": 2e6,
    "max_audio_minutes_month": 1e5,
    "max_fhir_resources_month": 5e5
  }
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Inh...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "issued_at": "2026-02-24T12:00:00Z"
}
```

### 3.2. Brain - JWKS Endpoint

**Endpoint:** `GET /.well-known/jwks.json`

**Response:**
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "xase-brain-key-1",
      "alg": "RS256",
      "n": "xGOz...",
      "e": "AQAB"
    }
  ]
}
```

### 3.3. Sidecar - Validação JWT

**Rust Code:**
```rust
use crate::auth::jwt::{fetch_jwks, validate_token};

// Fetch JWKS on startup
let jwks = fetch_jwks(&config.base_url).await?;

// Validate incoming JWT
let claims = validate_token(&token, &jwks, &config.base_url)?;

// Check scopes
if !has_scope(&claims, "ingest:read") {
    return Err(anyhow!("Missing required scope"));
}

// Check quotas
let current_usage = get_current_usage(); // From Prometheus
check_quota(&claims, &current_usage)?;
```

### 3.4. Sidecar - Métricas Enriquecidas

**Endpoint:** `GET /ready`

**Response:**
```json
{
  "ready": true,
  "timestamp": "2026-02-24T12:00:00Z",
  "version": "0.1.0",
  "ingestion_mode": "s3",
  "data_pipeline": "dicom",
  "features": {
    "dicom_ocr": true,
    "fhir_nlp": false,
    "audio_redaction": true,
    "prefetch": true
  },
  "billing_counters": {
    "dicom_images": 1200000,
    "fhir_resources": 300000,
    "audio_minutes": 4500,
    "text_pages": 0,
    "bytes_total": 850000000000,
    "redactions_total": 45000
  }
}
```

### 3.5. Brain - Billing Report

**Endpoint:** `GET /api/billing-report?tenant_id=X&month=2026-02&format=json`

**Response:**
```json
{
  "tenant_id": "tenant_hospital_sao_lucas",
  "period": "2026-02",
  "sidecar_url": "https://sidecar.hospital.local",
  "metrics": { ... },
  "billing_summary": {
    "dicom_images": 1200000,
    "fhir_resources": 300000,
    "audio_minutes": 4500,
    "text_pages": 0,
    "gb_processed": 850.5,
    "redactions": 45000
  },
  "pricing": {
    "dicom_per_1k_images": 50,
    "fhir_per_1k_resources": 20,
    "audio_per_100_minutes": 80,
    "text_per_1k_pages": 15,
    "base_monthly": 15000
  },
  "estimated_charges": {
    "dicom": 60000,
    "fhir": 6000,
    "audio": 3600,
    "text": 0,
    "base": 15000,
    "total": 84600
  }
}
```

**CSV Export:** `format=csv` retorna arquivo CSV para importação em sistemas de faturamento.

---

## 4. Operação e Manutenção

### 4.1. Job Diário de Coleta

**Script:** `src/lib/jobs/collect-billing-metrics.ts`

**Execução:**
```bash
# Manual
npx tsx src/lib/jobs/collect-billing-metrics.ts

# Via API (com auth)
curl -X POST https://xase.ai/api/jobs/collect-billing \
  -H "Authorization: Bearer $INTERNAL_JOB_TOKEN"

# Via Vercel Cron (vercel.json)
{
  "crons": [{
    "path": "/api/jobs/collect-billing",
    "schedule": "0 0 * * *"
  }]
}
```

**Persistência:** Snapshots salvos em `billing_snapshots` (Postgres).

### 4.2. Monitoramento

**Métricas-chave:**
- `xase_dicom_images_processed_total` - Total de imagens DICOM.
- `xase_quota_exceeded_total` - Quantas vezes quota foi excedida.
- `billing_snapshots` count - Snapshots coletados por dia.

**Alertas:**
- Quota atingida 80%: notificar tenant.
- Quota excedida 100%: bloquear processamento (429).
- Falha na coleta de métricas: alerta ops.

### 4.3. Rotação de Chaves JWT

**Procedimento:**
1. Gerar novo par RSA (RS256).
2. Adicionar nova chave ao JWKS com novo `kid`.
3. Emitir novos tokens com novo `kid`.
4. Manter chave antiga por 24h (grace period).
5. Remover chave antiga do JWKS.

**Script:**
```bash
# Generate new RSA key pair
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Base64 encode for env vars
base64 -i private.pem
base64 -i public.pem

# Update env vars
JWT_PRIVATE_KEY=<base64>
JWT_PUBLIC_KEY=<base64>
```

---

## 5. Migração e Deploy

### 5.1. Aplicar Migration

```bash
# Apply billing_snapshots table
npx tsx database/scripts/apply-billing-snapshot-migration.ts

# Regenerate Prisma client
npx prisma generate

# Verify schema
npx prisma db pull
```

### 5.2. Configurar Variáveis de Ambiente

**Brain (.env):**
```bash
# JWT Keys (production: use AWS Secrets Manager)
JWT_PRIVATE_KEY=<base64-encoded-pem>
JWT_PUBLIC_KEY=<base64-encoded-pem>

# Internal job token
INTERNAL_JOB_TOKEN=<random-secret>

# Sidecar URLs per tenant
SIDECAR_URL_TENANT_HOSPITAL_SAO_LUCAS=https://sidecar.hospital.local
```

**Sidecar (.env):**
```bash
# Brain URL for JWKS
XASE_BASE_URL=https://xase.ai

# Enable JWT validation (future)
ENABLE_JWT_AUTH=true
```

### 5.3. Testar Fluxo End-to-End

```bash
# 1. Test JWKS
curl https://xase.ai/.well-known/jwks.json

# 2. Test JWT issuance and validation
curl https://xase.ai/api/test-jwt-flow

# 3. Test billing report
curl "https://xase.ai/api/billing-report?tenant_id=test&month=2026-02"

# 4. Test Sidecar /ready
curl https://sidecar.hospital.local/ready
```

---

## 6. Roadmap e Evolução

### 6.1. Fase Atual (Q1 2026)
- ✅ Métricas por pipeline (DICOM, FHIR, Audio, Text).
- ✅ JWT/JWKS para autenticação.
- ✅ Billing report automatizado.
- ✅ Job de coleta diária.
- 🔄 Enforcement de quotas no Sidecar (implementação em andamento).

### 6.2. Próximos 3 Meses
- Marketplace: CTA "Request Access" com formulário de lead.
- Dashboard de billing para tenants (self-service).
- Alertas automáticos (80% quota, 100% quota).
- Integração com Stripe/faturamento.

### 6.3. Próximos 6-12 Meses
- **Outcome-based pricing** para enterprise:
  - Preço por % de savings em compliance.
  - Preço por horas médicas economizadas.
  - Preço por insights clínicos gerados.
- **Tiers** (Basic/Pro/Enterprise) com features diferenciadas.
- **Add-ons** (OCR avançado, NLP custom, áudio diarization).

---

## 7. FAQ

**Q: Por que Hybrid e não flat mensal?**  
A: Flat não captura upside quando uso cresce. Hybrid alinha revenue com custos de GPU/AI e permite NDR >130% (padrão em SaaS bilionárias).

**Q: Como evitar surpresas na fatura?**  
A: Quotas soft (alerta em 80%) e hard (bloqueio em 100%). Dashboard mostra uso em tempo real.

**Q: E se o hospital exceder quota?**  
A: Sidecar retorna 429. Tenant pode comprar overage ou upgrade de plano.

**Q: JWT expira em 1h. Como renovar?**  
A: Sidecar auto-renova via endpoint `/api/sidecar/token` (usando refresh token ou API key).

**Q: Dados de billing são auditáveis?**  
A: Sim. BillingSnapshot é append-only com timestamp. Métricas Prometheus são imutáveis.

**Q: Como migrar de flat para hybrid?**  
A: Gradual. Manter flat como base, adicionar overage opcional. Após 3 meses, migrar 100% para hybrid.

---

## 8. Contato e Suporte

- **Documentação Técnica:** `/docs/BILLING_HYBRID_SYSTEM.md`
- **API Reference:** `/docs/API_REFERENCE.md`
- **Suporte:** support@xase.ai
- **Sales:** sales@xase.ai

---

**Versão:** 1.0  
**Última Atualização:** 2026-02-24  
**Autor:** Xase Engineering Team
