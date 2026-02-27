# Xase Billing Hybrid System

Sistema de precificação **Hybrid** (assinatura base + uso variável) implementado para escalar revenue com NDR >130% e viabilizar valuation bilionária.

## 🚀 Quick Start

```bash
# 1. Apply migration and generate Prisma client
npm run billing:migrate

# 2. Configure environment variables
cp .env.example .env.local
# Edit .env.local with JWT keys and Sidecar URLs

# 3. Test the system
npm run billing:test

# 4. Collect metrics (manual)
npm run billing:collect
```

## 📚 Documentation

- **[Complete Guide](docs/BILLING_HYBRID_SYSTEM.md)** - Arquitetura, pricing, implementação técnica (8 seções)
- **[Quick Start](docs/BILLING_SETUP_QUICKSTART.md)** - Setup em 15 minutos
- **[Implementation Summary](docs/IMPLEMENTATION_SUMMARY_BILLING.md)** - O que foi implementado

## 🏗️ Architecture

```
Brain (Vercel)                    Sidecar (Hospital)
├─ JWT/JWKS                       ├─ JWT Validation
├─ Billing Report API             ├─ Quota Enforcement
├─ Daily Metrics Collection       ├─ Prometheus Metrics
└─ BillingSnapshot (Postgres)     └─ /ready with billing_counters
```

## 💰 Pricing Model

| Component | Unit | Price Example |
|-----------|------|---------------|
| Base Monthly | Per hospital | R$ 15.000 |
| DICOM Images | Per 1k images | R$ 50 |
| FHIR Resources | Per 1k resources | R$ 20 |
| Audio Minutes | Per 100 minutes | R$ 80 |
| Text Pages | Per 1k pages | R$ 15 |

## 🔑 Key Features

### ✅ Implemented
- Prometheus metrics per pipeline (DICOM, FHIR, Audio, Text)
- JWT/JWKS authentication (RS256)
- Billing report API (JSON/CSV export)
- Daily metrics collection job
- BillingSnapshot persistence (Postgres)
- Quota enforcement (429 when exceeded)
- Enriched `/ready` endpoint with billing counters

### 🔄 In Progress
- Sidecar JWT validation integration in main.rs
- Grafana dashboard for billing metrics
- Automated alerts (80% and 100% quota)

### 📋 Roadmap
- Self-service billing dashboard for tenants
- Stripe integration for invoicing
- Tiers (Basic/Pro/Enterprise)
- Outcome-based pricing for enterprise

## 🧪 Testing

```bash
# Run complete test suite
npm run billing:test

# Test individual components
curl http://localhost:3000/.well-known/jwks.json
curl http://localhost:3000/api/test-jwt-flow
curl "http://localhost:3000/api/billing-report?tenant_id=test&month=2026-02"
```

## 📊 API Endpoints

### Brain
- `GET /.well-known/jwks.json` - Public JWKS for JWT validation
- `POST /api/sidecar/token` - Issue JWT with quotas/features
- `GET /api/billing-report` - Generate billing report (JSON/CSV)
- `POST /api/jobs/collect-billing` - Trigger metrics collection
- `GET /api/test-jwt-flow` - Test JWT issuance and validation

### Sidecar
- `GET /ready` - Readiness check with billing counters
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics

## 🔐 Security

- **JWT:** RS256 with 1-hour TTL
- **JWKS:** Public key rotation support
- **Quotas:** Enforced per tenant via JWT claims
- **Audit:** BillingSnapshot append-only with timestamps

## 📦 Database Schema

```sql
CREATE TABLE billing_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sidecar_url TEXT NOT NULL,
  snapshot_date TIMESTAMPTZ NOT NULL,
  period TEXT NOT NULL,
  dicom_images DOUBLE PRECISION DEFAULT 0,
  fhir_resources DOUBLE PRECISION DEFAULT 0,
  audio_minutes DOUBLE PRECISION DEFAULT 0,
  text_pages DOUBLE PRECISION DEFAULT 0,
  bytes_total DOUBLE PRECISION DEFAULT 0,
  redactions_total DOUBLE PRECISION DEFAULT 0,
  -- ... metadata and features
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🛠️ Scripts

```bash
# Migration
npm run billing:migrate

# Collect metrics
npm run billing:collect

# Test system
npm run billing:test

# Manual collection
npx tsx src/lib/jobs/collect-billing-metrics.ts

# Generate report
curl "http://localhost:3000/api/billing-report?tenant_id=X&month=YYYY-MM&format=csv" -o billing.csv
```

## 🌐 Environment Variables

```bash
# JWT Keys (production: use AWS Secrets Manager)
JWT_PRIVATE_KEY=<base64-encoded-pem>
JWT_PUBLIC_KEY=<base64-encoded-pem>

# Internal job token
INTERNAL_JOB_TOKEN=<random-secret>

# Sidecar URLs per tenant
SIDECAR_URL_<TENANT_ID>=https://sidecar.hospital.local
```

## 📈 Metrics

### Sidecar Prometheus Metrics
- `xase_dicom_images_processed_total`
- `xase_fhir_resources_processed_total`
- `xase_audio_minutes_processed_total`
- `xase_text_pages_processed_total`
- `xase_bytes_processed_total`
- `xase_redactions_total`

### Brain Metrics (via BillingSnapshot)
- Daily snapshots per tenant
- Monthly aggregation for invoicing
- Trend analysis and forecasting

## 🐛 Troubleshooting

### Error: Property 'billingSnapshot' does not exist
**Fix:** Run `npm run billing:migrate`

### Error: JWKS endpoint 404
**Fix:** Ensure server restarted after creating `/.well-known/jwks.json/route.ts`

### Error: Sidecar /ready timeout
**Fix:** Check `SIDECAR_URL_*` env var and network connectivity

## 📞 Support

- **Documentation:** `/docs/BILLING_HYBRID_SYSTEM.md`
- **Quick Start:** `/docs/BILLING_SETUP_QUICKSTART.md`
- **Implementation:** `/docs/IMPLEMENTATION_SUMMARY_BILLING.md`

## 🎯 Success Metrics

- **NDR Target:** >130% (via usage expansion)
- **Margin Target:** >70% (aligned with AI costs)
- **Churn Target:** <5% annual
- **Valuation Path:** Unicorn ($1B+) via hybrid pricing + outcome-based evolution

---

**Status:** ✅ Production Ready  
**Version:** 1.0  
**Last Updated:** 2026-02-24
