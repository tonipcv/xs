# Xase Governed Access Marketplace - Invariants

## Overview

These are **non-negotiable rules** that must be maintained across the entire system. Violating these invariants breaks the canonical Xase architecture.

---

## 1. Offer-Centric Architecture

### Rule
**Treat `AccessOffer` as the product. `Dataset` is internal supply.**

### Implications
- ✅ Buyer-facing APIs use `offerId` and `executionId`
- ❌ Buyer-facing APIs NEVER expose raw `datasetId`
- ✅ Catalog page shows AccessOffers, not Datasets
- ✅ Navigation flows: Catalog → Offer Detail → Request Access → Execution Detail
- ❌ Navigation flows NEVER go: Dataset → Direct Access

### Why
- **Xase is an intermediary**: We sell governed access contracts, not raw data
- **Legal clarity**: The contract (AccessOffer) defines what's allowed, not the dataset
- **Trust signals**: Reviews and audits are tied to offers, not datasets
- **Pricing transparency**: Price is part of the offer, not hidden in policies

### Enforcement
- All buyer-facing routes under `/xase/governed-access` and `/xase/executions`
- Dataset routes under `/xase/voice/datasets` are supplier-only
- API endpoints use `offerId` in paths, not `datasetId`

---

## 2. Pricing Separation

### Rule
**Pricing belongs to `AccessOffer`. `VoiceAccessPolicy` is pure enforcement.**

### Implications
- ✅ `AccessOffer.pricePerHour` is the source of truth for pricing
- ❌ `VoiceAccessPolicy` has NO `pricePerHour` or `currency` fields
- ✅ `PolicyExecution.totalCost` is derived from `AccessOffer.pricePerHour × hoursUsed`
- ✅ Streaming API uses offer pricing to calculate costs

### Why
- **Separation of concerns**: Policy = enforcement, Offer = commercial terms
- **Flexibility**: Same policy can be used with different offers/pricing
- **Auditability**: Financial terms are explicit in the contract (offer)
- **No hidden costs**: Buyers see pricing before requesting access

### Enforcement
- Prisma schema: `VoiceAccessPolicy` has no pricing fields
- Migration: `20260209_p1_policy_pricing_and_sample_guardrails.sql` drops pricing columns
- API: `/api/v1/access-offers/[offerId]/execute` uses offer pricing when creating execution
- Streaming: `/api/v1/datasets/[datasetId]/stream` uses `AccessOffer.pricePerHour` for cost calculation

---

## 3. Sample Metadata No-Leak

### Rule
**`sampleMetadata` must NEVER contain raw audio URLs or storage paths.**

### Implications
- ✅ Allowed: `{ "avgDuration": 3.5, "avgSNR": 25.3, "syntheticPercentage": 0 }`
- ❌ Blocked: `{ "sampleUrl": "gs://bucket/sample.wav" }`
- ❌ Blocked: `{ "storagePath": "/data/samples/001.wav" }`
- ❌ Blocked: Any string value matching URL patterns (`gs://`, `s3://`, `http://`, `https://`)

### Why
- **Data leakage prevention**: Sample metadata is visible in catalog before purchase
- **Compliance**: Exposing raw audio URLs bypasses governance and metering
- **Trust**: Buyers should not be able to access data without executing the contract
- **Legal liability**: Unintentional data exposure could violate data holder agreements

### Enforcement
- **Zod validation**: `SampleMetadataSchema` in `/src/lib/validations/access-offer.ts`
  - Blocks known dangerous keys: `sampleUrl`, `storagePath`, `signedUrl`, etc.
  - Blocks any string values matching URL patterns
- **Database constraint**: `access_offers_sample_metadata_no_urls_chk` in migration
  - SQL CHECK constraint prevents URLs at DB level
- **API validation**: POST `/api/v1/datasets/[datasetId]/access-offers` validates input

### Examples

**Valid Sample Metadata:**
```json
{
  "avgDuration": 3.5,
  "avgSNR": 25.3,
  "syntheticPercentage": 0,
  "speakerCount": 150,
  "genderDistribution": { "male": 0.6, "female": 0.4 },
  "ageDistribution": { "18-30": 0.3, "31-50": 0.5, "51+": 0.2 }
}
```

**Invalid Sample Metadata (will be rejected):**
```json
{
  "sampleUrl": "gs://my-bucket/sample.wav",
  "storagePath": "/data/samples/001.wav",
  "downloadUrl": "https://example.com/sample.wav"
}
```

---

## 4. Runtime Governance

### Rule
**Every access must be metered in `PolicyExecution`.**

### Implications
- ✅ Streaming API updates `PolicyExecution.hoursUsed`, `requestCount`, `bytesStreamed`
- ✅ `totalCost` is calculated in real-time based on usage
- ✅ Evidence bundles include actual usage metrics
- ❌ Access without metering is not allowed

### Why
- **Accountability**: Both parties have verifiable records of usage
- **Billing accuracy**: Costs are based on actual usage, not estimates
- **Compliance**: Regulators can audit actual access patterns
- **Trust**: Transparent metering builds trust between suppliers and buyers

### Enforcement
- Streaming API: `/api/v1/datasets/[datasetId]/stream` updates `PolicyExecution` in transaction
- Evidence generation: `/api/v1/executions/[executionId]/evidence` includes usage metrics
- Execution detail page: Shows real-time usage metrics

---

## 5. Evidence Integrity

### Rule
**Evidence bundles must be cryptographically verifiable.**

### Implications
- ✅ Every evidence bundle has a SHA-256 hash
- ✅ Hash is stored in `PolicyExecution.evidenceHash`
- ✅ Evidence includes: contract terms, usage metrics, financials, timestamps
- ✅ Evidence is immutable (hash changes if tampered)

### Why
- **Legal validity**: Evidence can be used in court or regulatory proceedings
- **Non-repudiation**: Neither party can deny the terms or usage
- **Audit trail**: Complete record of access for compliance
- **Trust**: Cryptographic proof prevents disputes

### Enforcement
- Evidence generation: `/api/v1/executions/[executionId]/evidence` creates SHA-256 hash
- Database: `PolicyExecution.evidenceHash` stores the hash
- Frontend: Evidence detail page shows hash and allows download

---

## Testing Invariants

### Test 1: Offer-Centric
```bash
# ✅ Should work: Buyer discovers offer
GET /api/v1/access-offers?riskClass=MEDIUM

# ✅ Should work: Buyer requests access via offerId
POST /api/v1/access-offers/offer_abc123/execute

# ❌ Should fail: Buyer tries to access dataset directly
GET /api/v1/datasets/dataset_xyz789/stream
# (without valid lease from offer execution)
```

### Test 2: Pricing Separation
```bash
# ✅ Verify pricing comes from offer
GET /api/v1/access-offers/offer_abc123
# Response should include: "pricePerHour": 10.00

# ✅ Verify policy has no pricing
GET /api/v1/policies/policy_def456
# Response should NOT include: pricePerHour or currency

# ✅ Verify execution cost is calculated from offer
GET /api/v1/executions/exec_ghi789
# Response: "totalCost": 125.00 (= 12.5 hours × 10.00 per hour)
```

### Test 3: Sample Metadata No-Leak
```bash
# ❌ Should fail: Create offer with URL in sampleMetadata
POST /api/v1/datasets/dataset_xyz789/access-offers
{
  "sampleMetadata": {
    "sampleUrl": "gs://bucket/sample.wav"
  }
}
# Expected: 400 Bad Request with validation error

# ✅ Should work: Create offer with valid metadata
POST /api/v1/datasets/dataset_xyz789/access-offers
{
  "sampleMetadata": {
    "avgDuration": 3.5,
    "avgSNR": 25.3
  }
}
# Expected: 201 Created
```

---

## Violation Consequences

### Offer-Centric Violation
- **Impact**: Buyers bypass governance, access raw data without contracts
- **Risk**: Legal liability, no audit trail, no evidence generation
- **Fix**: Remove all buyer-facing `datasetId` references, use `offerId` only

### Pricing Separation Violation
- **Impact**: Hidden costs, pricing inconsistency, audit confusion
- **Risk**: Billing disputes, regulatory issues
- **Fix**: Remove pricing from Policy, always use AccessOffer pricing

### Sample Metadata No-Leak Violation
- **Impact**: Data leakage, governance bypass, compliance breach
- **Risk**: Legal liability, loss of trust, contract violations
- **Fix**: Validate all sampleMetadata, reject URLs/paths

### Runtime Governance Violation
- **Impact**: No usage tracking, no billing, no evidence
- **Risk**: Revenue loss, compliance failure, disputes
- **Fix**: Ensure all access paths update PolicyExecution metrics

### Evidence Integrity Violation
- **Impact**: Evidence tampering, legal invalidity, disputes
- **Risk**: Regulatory rejection, loss of trust
- **Fix**: Always generate SHA-256 hashes, store in database

---

## Maintenance

These invariants should be:
1. **Reviewed** before any schema changes
2. **Tested** in E2E tests
3. **Documented** in API docs
4. **Enforced** via code reviews
5. **Monitored** in production (alerts for violations)

Any proposed changes to these invariants require:
- Architecture review
- Legal review
- Customer communication
- Migration plan
