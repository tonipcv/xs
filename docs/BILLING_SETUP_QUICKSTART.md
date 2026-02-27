# Billing Hybrid System - Quick Start Guide

## Setup em 15 Minutos

### 1. Aplicar Migration (2 min)

```bash
# Apply billing_snapshots table
npx tsx database/scripts/apply-billing-snapshot-migration.ts

# Regenerate Prisma client
npx prisma generate
```

### 2. Configurar Variáveis de Ambiente (3 min)

**Brain (.env.local):**
```bash
# Generate RSA keys (one-time)
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Add to .env.local (base64 encoded)
JWT_PRIVATE_KEY=$(base64 -i private.pem)
JWT_PUBLIC_KEY=$(base64 -i public.pem)

# Internal job token (random secret)
INTERNAL_JOB_TOKEN=$(openssl rand -hex 32)

# Sidecar URL for test tenant
SIDECAR_URL_TEST_TENANT=https://aa-xase-sidecar.dpbdp1.easypanel.host
```

### 3. Testar JWT Flow (2 min)

```bash
# Start dev server
npm run dev

# Test JWKS endpoint
curl http://localhost:3000/.well-known/jwks.json

# Test JWT issuance and validation
curl http://localhost:3000/api/test-jwt-flow
```

**Expected Output:**
```json
{
  "success": true,
  "test_results": {
    "jwks_generated": true,
    "token_issued": true,
    "token_verified": true,
    "ttl_seconds": 3600
  }
}
```

### 4. Testar Billing Report (3 min)

```bash
# Test billing report (uses SIDECAR_URL_TEST_TENANT)
curl "http://localhost:3000/api/billing-report?tenant_id=test_tenant&format=json"

# Export CSV
curl "http://localhost:3000/api/billing-report?tenant_id=test_tenant&format=csv" -o billing.csv
```

### 5. Configurar Job Diário (2 min)

**Option A - Vercel Cron (Production):**

Create `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/jobs/collect-billing",
    "schedule": "0 0 * * *"
  }]
}
```

**Option B - Manual/Cron (Self-hosted):**
```bash
# Add to crontab
0 0 * * * cd /path/to/xase-sheets && npx tsx src/lib/jobs/collect-billing-metrics.ts
```

### 6. Testar Sidecar Integration (3 min)

```bash
# Check Sidecar /ready endpoint
curl https://aa-xase-sidecar.dpbdp1.easypanel.host/ready

# Expected: billing_counters present
{
  "ready": true,
  "billing_counters": {
    "dicom_images": 0,
    "fhir_resources": 0,
    "audio_minutes": 0,
    "text_pages": 0,
    "bytes_total": 0,
    "redactions_total": 0
  }
}
```

---

## Pricing Configuration

Edit `src/app/api/billing-report/route.ts`:

```typescript
const pricing = {
  dicom_per_1k_images: 50,      // R$ 50 per 1k images
  fhir_per_1k_resources: 20,    // R$ 20 per 1k resources
  audio_per_100_minutes: 80,    // R$ 80 per 100 minutes
  text_per_1k_pages: 15,        // R$ 15 per 1k pages
  base_monthly: 15000,          // R$ 15k base subscription
};
```

---

## Troubleshooting

### Error: "Property 'billingSnapshot' does not exist"
**Fix:** Run `npx prisma generate` after applying migration.

### Error: "JWKS endpoint returned 404"
**Fix:** Ensure `/.well-known/jwks.json/route.ts` exists and server restarted.

### Error: "Sidecar /ready timeout"
**Fix:** Check `SIDECAR_URL_*` env var and network connectivity.

### Billing report shows 0 for all counters
**Fix:** Sidecar needs to process data first. Counters increment on actual usage.

---

## Next Steps

1. **Add Real Tenant:** Configure `SIDECAR_URL_<tenant_id>` for production hospital.
2. **Enable Quotas:** Issue JWT with quotas via `/api/sidecar/token`.
3. **Setup Alerts:** Monitor `billing_snapshots` for quota thresholds.
4. **Integrate Stripe:** Connect billing report to invoicing system.

---

## Production Checklist

- [ ] JWT keys stored in AWS Secrets Manager (not .env)
- [ ] `INTERNAL_JOB_TOKEN` rotated monthly
- [ ] Vercel Cron configured for daily collection
- [ ] Grafana dashboard for billing metrics
- [ ] Alerts for quota 80% and 100%
- [ ] Backup of `billing_snapshots` table
- [ ] API rate limiting on `/api/billing-report`

---

**Time to Production:** ~15 minutes setup + 1 day integration testing.

**Support:** Refer to `/docs/BILLING_HYBRID_SYSTEM.md` for complete documentation.
