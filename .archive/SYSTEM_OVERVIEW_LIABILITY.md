# 🧭 System Overview & Liability Readiness

## ✅ High-level Summary
- **Framework**: Next.js (App Router) + NextAuth (JWT) + Prisma + PostgreSQL.
- **Core domains**:
  - Auth & Sessions (NextAuth models).
  - Billing (Plan, Price, Subscription) — preserved.
  - Xase Core (Tenant, ApiKey, DecisionRecord) — added.
- **Removed**: WhatsApp/IA module and PrayerRequest.
- **Diagnostics**: Middleware with structured logs and response headers that explain redirects in production.

---

## 🧱 Data Model (what exists now)
- **Auth**: `User`, `Account`, `Session`, `VerificationToken`.
- **Billing**: `Plan`, `Price`, `Subscription`.
- **Xase Core**:
  - `Tenant` (org/space owner of API keys and records).
  - `ApiKey` (bcrypt-hashed secret for ingestion, rate limit config, lastUsedAt).
  - `DecisionRecord` (immutable ledger: `inputHash`, `outputHash`, `contextHash`, `recordHash`, `previousHash`, `transactionId`, policy metadata, timestamps).
  - Enums: `TenantStatus`, `XaseRole`.
  - `User` has optional `tenantId` + `xaseRole` to access console/admin.

---

## 🔗 Endpoints & UX
- **Xase ingestion**: `POST /api/xase/v1/records`
  - Header: `X-API-Key`.
  - Body: `{ input, output, context?, policyId?, policyVersion?, decisionType?, confidence?, processingTime?, storePayload? }`.
  - Behavior: hashes input/output/context; chains with previous record; persists; returns `{ transaction_id, receipt_url, record_hash }`.
- **Health**: `GET /api/xase/v1/records`.
- **Verify**: `GET /api/xase/v1/verify/:id` — recompute hashes, verify chain integrity; returns detailed verdict.
- **Public Receipt**: `GET /xase/receipt/:id` — public HTML with cryptographic proof (no private payloads).

---

## 🔒 Security & Integrity (current)
- **API Keys**: stored as bcrypt hash (`keyHash`), compared on ingestion.
- **Rate limiting**: basic (count decision records per hour) — upgrade path to Redis.
- **Immutability**: triggers on `xase_decision_records` prevent UPDATE/DELETE; chain verification by `recordHash`.
- **Diagnostics** (`src/middleware.ts`):
  - Logs: `mw_request` and `mw_redirect` with `{reqId, env, host, path, reason, role?}`.
  - Response headers on redirect: `X-Req-Id`, `X-Env`, `X-Path`, `X-Auth-Reason`, `X-Redirect-Reason`, `X-User-Has-Token`, `X-User-Role`.
- **Admin Gate**: `/admin/:path*` protected; allows when `token.isAdmin === true` or `token.xaseRole ∈ {OWNER, ADMIN}`; else 307 to `/login` with diagnostic headers.

---

## 🔎 End-to-end Flow
1. Client system sends decision → `POST /api/xase/v1/records` with `X-API-Key`.
2. API validates key, checks rate limit, hashes input/output/context.
3. Fetch last record for tenant, computes `recordHash = SHA256(previousHash + inputHash + outputHash + (contextHash||''))`.
4. Persists `DecisionRecord` (+ optional payload JSON strings).
5. Responds with `transaction_id` + receipt URL.
6. Anyone can verify at `GET /api/xase/v1/verify/:id` or view public receipt page.

---

## 🗺️ Architecture (mermaid)
```mermaid
flowchart TD
  C[External System] -- X-API-Key --> API[Next.js API /api/xase]
  subgraph Next.js App
    API --> HASH[hashObject/chainHash]
    HASH --> DB[(PostgreSQL)]
    API --> VERIFY[GET /verify/:id]
    VERIFY --> DB
    UI[/xase/receipt/:id] --> DB
    MW[middleware.ts] --> AUTH[NextAuth JWT]
  end
  DB -. optional .-> S3[(Object Storage)]
```

---

## 🧪 Observability
- **Structured logs** for middleware.
- **Add soon**: API logs with `reqId`, timing, status, tenantId; tracing (OpenTelemetry) to follow an ingestion request end-to-end.
- **Metrics to track**: ingestion rate, verify latency, chain tamper rate, per-key usage, top tenants.

---

## 🧰 Operations
- **Migrations**: `node database/run-migration.js --all` applies core + `database/migrations/*.sql` in order; `npx prisma generate` refreshes client.
- **Tenant bootstrap**: `node database/create-tenant.js "Acme" "tech@acme.com" "Acme Corp"` → prints API Key (one-time).
- **Rotate API Key** (manual for now): create a new key, distribute, disable old key after grace period.

---

## 🧾 Liability-grade: what’s missing
- **Tamper-evidence anchoring**: 
  - Sign `recordHash` with KMS/HSM; optional anchoring to TSA or public blockchain.
- **Evidence storage**:
  - Store large payloads in object storage (S3/R2) with WORM/retention; only keep hashes in DB.
- **Governance & privacy**:
  - PII minimization/anonymization; retention & purge policies per tenant; DSR (LGPD/GDPR) automations.
- **Audit trails**:
  - WORM logs for admin actions (key rotation, tenant changes, access to payloads/exports), with retention.
- **RBAC & console**:
  - `/xase/console` for tenants: listing, filters, export package of proof (ZIP manifest + hashes + signed attestation).
  - `/admin/*` full admin screens: tenants, users, api-keys, settings.
- **Rate limiting & abuse**:
  - Redis-backed rate limiting with sliding window, per-key/per-tenant quotas, anomaly alerts.
- **Reliability**:
  - Automated backups, restore drills, RPO/RTO defined; blue/green deployments; multi-AZ DB.
- **Monitoring & Alerts**:
  - Prometheus/Grafana or vendor; alerts for error rate, ingestion backlog, verify failures, tamper spikes.
- **SDKs**:
  - Official Node/Python SDK with local verification helpers and retries/telemetry; Postman collection.
- **Contracts & docs**:
  - ToS/Privacy/DPA templates; runbooks (incident response, key rotation, restore); compliance evidence (SOC2/ISO 27001).

---

## 🔜 Short Roadmap
- **Phase A (Security/Integrity)**: KMS signing + Redis rate limit + API logs/tracing.
- **Phase B (Console/UX)**: `/xase/console`, RBAC, export package of proof.
- **Phase C (Compliance/Ops)**: retention policies, audit trails WORM, backups & drills, alerts.
- **Phase D (Enterprise)**: SSO (SAML/OIDC), org billing, tenant-level quotas, SDKs.

---

## 📋 Quick Validation
```bash
# Health
curl -s http://localhost:3000/api/xase/v1/records | jq

# Create decision (replace API_KEY)
curl -s -X POST http://localhost:3000/api/xase/v1/records \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"input":{"user":123},"output":{"approved":true},"storePayload":true}' | jq

# Verify
curl -s http://localhost:3000/api/xase/v1/verify/txn_xxx | jq
```

---

## ✅ Current Health Checklist
- **Core tables**: `xase_*` presentes
- **Prisma Client**: gerado
- **APIs**: create/verify/receipt funcionando
- **Middleware**: headers/logs de diagnóstico ativos
- **Removed**: WhatsApp/IA & PrayerRequest
