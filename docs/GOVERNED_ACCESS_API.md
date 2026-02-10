# Governed Access Marketplace API Documentation

## Overview

The Governed Access Marketplace implements the canonical Xase architecture where **AccessOffer** is the product (not Dataset), with runtime-governed access, executable policies, and automatic evidence generation.

## Core Principles

### 1. Offer-Centric Architecture
- **Buyer-facing APIs** use `offerId` and `executionId`, never raw `datasetId`
- Dataset is internal supply; AccessOffer is the catalog product
- All pricing comes from AccessOffer, not Policy

### 2. Runtime Governance
- Every access is metered in `PolicyExecution`
- Usage tracked: `hoursUsed`, `requestCount`, `bytesStreamed`
- Automatic cost calculation based on `AccessOffer.pricePerHour`

### 3. Evidence Generation
- Cryptographic audit bundles with SHA-256 hashes
- Includes contract terms, usage metrics, and financials
- Downloadable JSON format for regulatory compliance

### 4. Sample Metadata Guardrails
- `sampleMetadata` must NEVER contain URLs or storage paths
- Only metadata allowed (durations, SNR, hashes, synthetic flags)
- Enforced via Zod validation and DB CHECK constraint

---

## API Endpoints

### Supplier APIs (Data Holder)

#### POST /api/v1/datasets/[datasetId]/access-offers
Create a new governed access offer from a dataset.

**Request Body:**
```json
{
  "title": "Governed Access: Medical Voice Dataset",
  "description": "High-quality medical voice recordings...",
  "allowedPurposes": [
    "Training speech recognition models",
    "Medical research"
  ],
  "constraints": {
    "canStream": true,
    "canBatchDownload": false,
    "canCache": false,
    "canExport": false,
    "canFineTuneReuse": false,
    "retentionPolicy": "DELETE_AFTER_30_DAYS",
    "requiresEncryption": true,
    "requiresAuditLog": true
  },
  "jurisdiction": "US",
  "evidenceFormat": "CRYPTOGRAPHIC_AUDIT_BUNDLE",
  "complianceLevel": "SELF_DECLARED",
  "scopeHours": 100,
  "scopeRecordings": 10000,
  "priceModel": "PAY_PER_HOUR",
  "pricePerHour": 10.00,
  "currency": "USD",
  "language": "en-US",
  "useCases": ["Healthcare", "Research"],
  "riskClass": "MEDIUM",
  "sampleMetadata": {
    "avgDuration": 3.5,
    "avgSNR": 25.3,
    "syntheticPercentage": 0
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "clx...",
  "offerId": "offer_abc123...",
  "status": "DRAFT",
  ...
}
```

---

### Buyer APIs (Data Consumer)

#### GET /api/v1/access-offers
List all available access offers (catalog).

**Query Parameters:**
- `riskClass` - Filter by risk class (LOW, MEDIUM, HIGH, CRITICAL)
- `language` - Filter by language (e.g., en-US)
- `jurisdiction` - Filter by jurisdiction (e.g., US, EU)
- `maxPrice` - Maximum price per hour
- `useCase` - Filter by use case
- `supplierId` - Filter by supplier tenant ID
- `status` - Filter by status (default: ACTIVE)
- `limit` - Results per page (default: 20)
- `offset` - Pagination offset (default: 0)

**Response:** `200 OK`
```json
{
  "offers": [
    {
      "offerId": "offer_abc123...",
      "title": "Governed Access: Medical Voice Dataset",
      "description": "...",
      "pricePerHour": 10.00,
      "currency": "USD",
      "scopeHours": 100,
      "riskClass": "MEDIUM",
      "jurisdiction": "US",
      "language": "en-US",
      "useCases": ["Healthcare"],
      "successfulAudits": 15,
      "totalExecutions": 42,
      "supplier": {
        "id": "...",
        "name": "Medical Research Institute",
        "organizationType": "RESEARCH"
      },
      "_count": {
        "executions": 42,
        "reviews": 15
      }
    }
  ],
  "total": 100,
  "limit": 20,
  "offset": 0
}
```

---

#### GET /api/v1/access-offers/[offerId]
Get detailed information about a specific access offer.

**Response:** `200 OK`
```json
{
  "offerId": "offer_abc123...",
  "title": "Governed Access: Medical Voice Dataset",
  "description": "...",
  "allowedPurposes": ["Training speech recognition models"],
  "constraints": { ... },
  "jurisdiction": "US",
  "evidenceFormat": "CRYPTOGRAPHIC_AUDIT_BUNDLE",
  "complianceLevel": "SELF_DECLARED",
  "scopeHours": 100,
  "pricePerHour": 10.00,
  "currency": "USD",
  "language": "en-US",
  "riskClass": "MEDIUM",
  "successfulAudits": 15,
  "totalExecutions": 42,
  "supplier": { ... },
  "dataset": {
    "id": "...",
    "name": "Medical Voice Dataset",
    "totalDurationHours": 500,
    "numRecordings": 10000,
    "primaryLanguage": "en-US"
  },
  "reviews": [ ... ],
  "_count": { ... }
}
```

---

#### POST /api/v1/access-offers/[offerId]/execute
Request governed access (execute the contract).

**Request Body:**
```json
{
  "usagePurpose": "Training a speech recognition model for medical transcription",
  "requestedHours": 50,
  "environment": "production"
}
```

**Response:** `201 Created`
```json
{
  "execution": {
    "executionId": "exec_xyz789...",
    "offerId": "...",
    "buyerTenantId": "...",
    "policyId": "...",
    "leaseId": "...",
    "status": "ACTIVE",
    "startedAt": "2026-02-09T22:00:00Z",
    "expiresAt": "2026-03-11T22:00:00Z"
  },
  "policy": { ... },
  "lease": { ... },
  "message": "Access granted. Use the lease credentials to stream data."
}
```

---

#### GET /api/v1/executions
List all executions for the authenticated buyer.

**Query Parameters:**
- `status` - Filter by status (ACTIVE, COMPLETED, EXPIRED, REVOKED)
- `limit` - Results per page (default: 20)
- `offset` - Pagination offset (default: 0)

**Response:** `200 OK`
```json
{
  "executions": [
    {
      "executionId": "exec_xyz789...",
      "offerId": "...",
      "status": "ACTIVE",
      "hoursUsed": 12.5,
      "requestCount": 150,
      "bytesStreamed": "5368709120",
      "totalCost": 125.00,
      "currency": "USD",
      "startedAt": "2026-02-09T22:00:00Z",
      "expiresAt": "2026-03-11T22:00:00Z",
      "offer": { ... },
      "policy": { ... },
      "lease": { ... }
    }
  ],
  "total": 10,
  "limit": 20,
  "offset": 0
}
```

---

#### GET /api/v1/executions/[executionId]
Get detailed information about a specific execution.

**Response:** `200 OK`
```json
{
  "executionId": "exec_xyz789...",
  "offerId": "...",
  "status": "ACTIVE",
  "hoursUsed": 12.5,
  "requestCount": 150,
  "bytesStreamed": "5368709120",
  "totalCost": 125.00,
  "currency": "USD",
  "evidenceHash": "a3f5...",
  "evidenceGeneratedAt": "2026-02-10T10:00:00Z",
  "startedAt": "2026-02-09T22:00:00Z",
  "expiresAt": "2026-03-11T22:00:00Z",
  "offer": { ... },
  "policy": { ... },
  "lease": { ... },
  "review": { ... },
  "usageMetrics": {
    "hoursUsed": 12.5,
    "requestCount": 150,
    "bytesStreamed": "5368709120",
    "totalCost": 125.00,
    "currency": "USD",
    "utilizationPercent": 25.0
  }
}
```

---

#### POST /api/v1/executions/[executionId]/evidence
Generate cryptographic evidence bundle.

**Response:** `200 OK`
```json
{
  "evidence": {
    "executionId": "exec_xyz789...",
    "offerId": "offer_abc123...",
    "buyerTenant": { ... },
    "contract": {
      "allowedPurposes": [ ... ],
      "constraints": { ... },
      "jurisdiction": "US",
      "complianceLevel": "SELF_DECLARED"
    },
    "usage": {
      "hoursUsed": 12.5,
      "requestCount": 150,
      "bytesStreamed": "5368709120",
      "startedAt": "2026-02-09T22:00:00Z",
      "completedAt": null
    },
    "financials": {
      "totalCost": 125.00,
      "currency": "USD",
      "pricePerHour": 10.00
    },
    "policy": { ... },
    "lease": { ... },
    "generatedAt": "2026-02-10T10:00:00Z",
    "cryptographicProof": {
      "algorithm": "SHA-256",
      "hash": "a3f5d8c2b1e4f7a9...",
      "timestamp": "2026-02-10T10:00:00Z"
    }
  },
  "downloadUrl": "/api/v1/executions/exec_xyz789.../evidence/download"
}
```

---

#### POST /api/v1/executions/[executionId]/review
Submit a review for the execution.

**Request Body:**
```json
{
  "policyClarityRating": 5,
  "accessReliabilityRating": 4,
  "evidenceQualityRating": 5,
  "overallRating": 5,
  "regulatorAccepted": true,
  "regulatorName": "FDA",
  "auditSuccessful": true,
  "auditFeedback": "Evidence bundle was accepted by our compliance team",
  "review": "Excellent governed access contract. Clear policies and reliable access.",
  "usedFor": "Medical transcription model training"
}
```

**Response:** `201 Created`
```json
{
  "id": "...",
  "offerId": "...",
  "executionId": "...",
  "buyerTenantId": "...",
  "policyClarityRating": 5,
  "accessReliabilityRating": 4,
  "evidenceQualityRating": 5,
  "overallRating": 5,
  "regulatorAccepted": true,
  "auditSuccessful": true,
  "createdAt": "2026-02-10T12:00:00Z"
}
```

---

## Data Models

### AccessOffer
The catalog product representing a governed access contract.

**Key Fields:**
- `offerId` - Unique identifier (buyer-facing)
- `title`, `description` - Human-readable contract details
- `allowedPurposes` - What buyers can use the data for
- `constraints` - Technical and legal limitations (JSON)
- `jurisdiction` - Legal jurisdiction
- `pricePerHour` - Pricing (NOT in Policy)
- `scopeHours` - Maximum hours available
- `riskClass` - LOW, MEDIUM, HIGH, CRITICAL
- `successfulAudits` - Trust signal (precedent)
- `totalExecutions` - Trust signal (usage)

### PolicyExecution
Runtime governance and metering for an active contract.

**Key Fields:**
- `executionId` - Unique identifier
- `offerId` - Reference to AccessOffer
- `policyId` - Reference to enforcement policy
- `leaseId` - Reference to TTL-based lease
- `hoursUsed` - Metered usage (updated on streaming)
- `requestCount` - Number of API requests
- `bytesStreamed` - Total bytes transferred
- `totalCost` - Calculated cost (pricePerHour × hoursUsed)
- `evidenceHash` - SHA-256 hash of evidence bundle
- `status` - ACTIVE, COMPLETED, EXPIRED, REVOKED

### AccessReview
Legal utility feedback (not "nice audio" ratings).

**Key Fields:**
- `policyClarityRating` - How clear were the policies?
- `accessReliabilityRating` - Was access reliable?
- `evidenceQualityRating` - Was evidence useful for compliance?
- `regulatorAccepted` - Did a regulator accept the evidence?
- `auditSuccessful` - Did the audit pass?
- `overallRating` - Overall legal utility (1-5)

---

## Invariants

### 1. Offer-Centric
- Buyer-facing APIs MUST use `offerId`/`executionId`, never raw `datasetId`
- Dataset is internal supply, not the product

### 2. Pricing Separation
- Pricing MUST come from `AccessOffer.pricePerHour`
- `VoiceAccessPolicy` has NO pricing fields
- `PolicyExecution.totalCost` is derived from offer + runtime usage

### 3. Sample Metadata No-Leak
- `sampleMetadata` MUST NOT contain URLs or storage paths
- Only metadata allowed: durations, SNR, hashes, synthetic flags
- Enforced via Zod validation + DB CHECK constraint

---

## Integration with Streaming

When data is streamed via `/api/v1/datasets/[datasetId]/stream`, the system:

1. Validates the lease and policy
2. Generates presigned URLs for batch access
3. **Meters usage into PolicyExecution:**
   - Increments `hoursUsed` by `estimatedHours`
   - Increments `requestCount` by 1
   - Increments `bytesStreamed` by estimated bytes
   - Updates `totalCost` based on `pricePerHour`
4. Creates access log for audit trail
5. Consumes epsilon budget for differential privacy

---

## Frontend Routes

### Buyer Routes
- `/xase/governed-access` - Catalog page (browse offers)
- `/xase/governed-access/[offerId]` - Offer detail + request access
- `/xase/executions` - List all executions
- `/xase/executions/[executionId]` - Execution detail + evidence + review

### Supplier Routes
- `/xase/voice/datasets/[datasetId]` - Dataset detail with "Publish as Access Offer" button

---

## Testing Checklist

- [ ] Supplier can publish AccessOffer from dataset
- [ ] Buyer can discover offers in catalog with filters
- [ ] Buyer can view offer details and contract terms
- [ ] Buyer can request access (creates PolicyExecution + Lease)
- [ ] Streaming API meters usage into PolicyExecution
- [ ] Buyer can view execution details and usage metrics
- [ ] Buyer can generate evidence bundle with cryptographic hash
- [ ] Buyer can submit review with legal utility ratings
- [ ] sampleMetadata validation blocks URLs/paths
- [ ] Pricing comes only from AccessOffer, not Policy
- [ ] All buyer-facing flows use offerId/executionId, not datasetId

---

## Security Considerations

1. **API Key Authentication**: All streaming requests require valid API key
2. **Lease Validation**: Leases must be active and not expired
3. **Policy Enforcement**: Constraints are enforced at runtime
4. **Rate Limiting**: API keys are rate-limited to prevent abuse
5. **IP Whitelisting**: Optional global IP whitelist via env var
6. **Epsilon Budget**: Differential privacy budget tracked per tenant/dataset
7. **Evidence Integrity**: SHA-256 hashes ensure evidence tampering detection

---

## Error Codes

- `400` - Invalid request (validation failed)
- `401` - Unauthorized (no valid session/API key)
- `403` - Forbidden (lease expired, policy violation, quota exceeded)
- `404` - Not found (offer/execution doesn't exist)
- `429` - Rate limit exceeded or epsilon budget exhausted
- `500` - Internal server error
