# Xase Voice Data Governance - System Architecture

**Version:** 2.0  
**Last Updated:** February 10, 2026  
**Status:** Production-Ready

---

## Executive Summary

Xase is a **Voice Data Governance Platform** that enables organizations to manage, share, and audit voice datasets with cryptographic guarantees. The system operates as a **B2B marketplace** connecting:

- **AI Holders (Suppliers):** Organizations with voice datasets
- **AI Labs (Buyers):** Organizations seeking governed access to voice data

### Core Value Proposition

1. **Governed Access:** Policy-based access control with cryptographic audit trails
2. **Multi-Source Datasets:** Aggregate voice data from multiple cloud storage providers
3. **Compliance-First:** Built-in consent management, retention policies, and evidence bundles
4. **Marketplace:** Discover, negotiate, and execute data access agreements

---

## System Architecture Overview

### Technology Stack

#### Frontend
- **Framework:** Next.js 15.1.11 (App Router)
- **UI Library:** React 18.3.1
- **Styling:** TailwindCSS 3.4.14 + shadcn/ui components
- **State Management:** React Context + Server Components
- **Authentication:** NextAuth.js 4.24.11

#### Backend
- **Runtime:** Node.js (Next.js API Routes)
- **Database:** PostgreSQL (via Prisma ORM 6.4.0)
- **Queue System:** BullMQ 5.66.5 + Redis 5.1.0
- **File Storage:** Multi-cloud (AWS S3, GCS, Azure Blob)
- **Analytics:** ClickHouse (optional)

#### Security & Compliance
- **Encryption:** AWS KMS, Azure Key Vault
- **Evidence:** Cryptographic audit bundles (JSZip + crypto)
- **OAuth:** Multi-provider (AWS, GCS, Azure, Snowflake, BigQuery)

---

## Core Domain Models

### 1. Multi-Tenancy

```prisma
Tenant {
  - organizationType: SUPPLIER | CLIENT | PLATFORM_ADMIN
  - status: ACTIVE | SUSPENDED | CANCELLED
  - plan: free | pro | enterprise
}
```

**Key Relationships:**
- Users belong to Tenants
- Datasets belong to Tenants (Suppliers)
- Policies connect Supplier Tenants to Client Tenants

### 2. Voice Datasets (Multi-Source)

```prisma
Dataset {
  // Aggregated Metadata
  - totalDurationHours: Float
  - numRecordings: Int
  - primaryLanguage: String
  - totalSizeBytes: BigInt
  
  // Governance
  - consentStatus: PENDING | VERIFIED_BY_XASE | SELF_DECLARED
  - allowedPurposes: String[]
  - jurisdiction: String
  - retentionExpiresAt: DateTime
  
  // Processing
  - processingStatus: PENDING | QUEUED | PROCESSING | COMPLETED | FAILED
  - status: DRAFT | ACTIVE | ARCHIVED
}

DataSource {
  - cloudIntegrationId: String (OAuth connection)
  - storageLocation: String (bucket/path)
  - numRecordings: Int
  - durationHours: Float
  - sizeBytes: BigInt
}

AudioSegment {
  - dataSourceId: String
  - fileKey: String
  - durationSec: Float
  - sampleRate: Int
  - language: String
  - snr: Float (signal-to-noise ratio)
}
```

**Architecture Pattern:** Datasets aggregate multiple DataSources, each linked to a CloudIntegration (OAuth).

### 3. Cloud Integrations (OAuth)

```prisma
CloudIntegration {
  - provider: AWS_S3 | GCS | AZURE_BLOB | SNOWFLAKE | BIGQUERY
  - encryptedAccessToken: String
  - encryptedRefreshToken: String
  - tokenExpiresAt: DateTime
  - status: ACTIVE | ERROR | DISABLED | EXPIRED
}
```

**Supported Providers:**
- AWS S3 (OAuth via Cognito)
- Google Cloud Storage (OAuth 2.0)
- Azure Blob Storage (OAuth 2.0)
- Snowflake (OAuth)
- BigQuery (OAuth)

### 4. Access Policies & Leases

```prisma
VoiceAccessPolicy {
  - datasetId: String
  - clientTenantId: String
  - usagePurpose: String
  - maxHours: Float
  - expiresAt: DateTime
  - canStream: Boolean
  - canBatchDownload: Boolean
  
  // Federated Query Rewrite
  - allowedColumns: String[]
  - deniedColumns: String[]
  - rowFilters: Json
  - maskingRules: Json
}

VoiceAccessLease {
  - leaseId: String (TTL-based streaming token)
  - datasetId: String
  - policyId: String
  - expiresAt: DateTime
  - status: ACTIVE | EXPIRED | REVOKED
}
```

**Access Flow:**
1. Client requests access → Policy created
2. Policy approved → Lease issued (TTL: 1-24 hours)
3. Client uses Lease to stream/download data
4. All access logged in `VoiceAccessLog`

### 5. Governed Access Marketplace

```prisma
AccessOffer {
  - datasetId: String
  - supplierTenantId: String
  - title: String
  - allowedPurposes: String[]
  - constraints: Json (executable rules)
  - priceModel: PAY_PER_HOUR | PAY_PER_REQUEST | FIXED_LEASE
  - pricePerHour: Decimal
  - riskClass: LOW | MEDIUM | HIGH | CRITICAL
  - status: DRAFT | ACTIVE | PAUSED | EXPIRED
}

PolicyExecution {
  - offerId: String
  - buyerTenantId: String
  - policyId: String
  - leaseId: String
  - hoursUsed: Float
  - totalCost: Decimal
  - evidenceBundleUrl: String
  - status: ACTIVE | COMPLETED | EXPIRED | AUDITED
}

AccessReview {
  - policyClarityRating: Int (1-5)
  - accessReliabilityRating: Int (1-5)
  - evidenceQualityRating: Int (1-5)
  - regulatorAccepted: Boolean
  - auditSuccessful: Boolean
}
```

---

## Application Structure

### Frontend Routes

#### Public Routes
- `/login` - Authentication
- `/register` - User registration
- `/forgot-password` - Password recovery

#### Xase Platform Routes
- `/xase/ai-holder/*` - Supplier dashboard (dataset management)
- `/xase/ai-lab/*` - Buyer dashboard (marketplace, access requests)
- `/xase/admin/*` - Platform admin (tenant management)
- `/xase/api-keys` - API key management
- `/xase/audit` - Audit logs viewer
- `/xase/bundles` - Evidence bundle viewer
- `/xase/compliance` - Compliance dashboard
- `/xase/connectors` - Data connector management
- `/xase/integrations` - Cloud OAuth integrations

#### Legacy Routes (To Be Removed)
- `/xase/voice/*` → Redirects to `/xase/ai-holder/*`
- `/xase/checkpoints` → Removed (old architecture)
- `/ia/*` - Old AI chat interface (unused)
- `/planos` - Old subscription page (unused)

### API Routes Structure

```
/api/
├── auth/[...nextauth]/ - NextAuth.js handlers
├── xase/
│   ├── datasets/ - Dataset CRUD
│   ├── policies/ - Policy management
│   ├── leases/ - Lease issuance
│   ├── access-logs/ - Access tracking
│   ├── bundles/ - Evidence generation
│   ├── offers/ - Marketplace offers
│   ├── executions/ - Policy executions
│   └── reviews/ - Access reviews
├── oauth/
│   ├── [provider]/authorize - OAuth initiation
│   └── [provider]/callback - OAuth callback
├── cloud-integrations/ - Integration management
├── onboarding/ - Onboarding flow
└── v1/ - External API (SDK)
```

---

## Data Flow Patterns

### 1. Dataset Creation Flow

```
User → Upload Dataset Metadata
  ↓
Link CloudIntegration (OAuth)
  ↓
Create DataSource(s)
  ↓
Queue Audio Processing Job (BullMQ)
  ↓
Worker: Scan Storage, Extract Metadata
  ↓
Create AudioSegment records
  ↓
Aggregate to Dataset level
  ↓
Dataset Status: ACTIVE
```

### 2. Access Request Flow

```
Buyer discovers AccessOffer
  ↓
Buyer requests access
  ↓
Supplier reviews request
  ↓
VoiceAccessPolicy created
  ↓
VoiceAccessLease issued (TTL)
  ↓
PolicyExecution tracks usage
  ↓
Evidence bundle generated on completion
  ↓
AccessReview submitted
```

### 3. Evidence Bundle Generation

```
PolicyExecution completed
  ↓
Collect: Policy, Dataset metadata, Access logs
  ↓
Generate cryptographic proof (KMS signature)
  ↓
Package as ZIP with signature
  ↓
Upload to S3/GCS
  ↓
Return evidenceBundleUrl
```

---

## Security Architecture

### Authentication & Authorization

1. **User Authentication:** NextAuth.js with JWT sessions
2. **API Authentication:** API Keys (hashed, rate-limited)
3. **OAuth Tokens:** Encrypted at rest (AES-256)
4. **CSRF Protection:** Double-submit cookie pattern

### Data Protection

1. **Encryption at Rest:**
   - OAuth tokens: AES-256-GCM
   - Database: PostgreSQL encryption
   - Files: Cloud provider encryption (S3-SSE, GCS-CMEK)

2. **Encryption in Transit:**
   - HTTPS/TLS 1.3
   - Strict-Transport-Security headers

3. **Secrets Management:**
   - AWS KMS for key management
   - Environment variables for API keys
   - No hardcoded credentials

### Audit & Compliance

1. **Audit Logs:** All actions logged to `AuditLog` table
2. **Access Logs:** All data access logged to `VoiceAccessLog`
3. **Evidence Bundles:** Cryptographic proof of compliance
4. **Consent Tracking:** `consentStatus`, `consentProofUri`, `consentProofHash`

---

## Database Schema Highlights

### Key Indexes

```sql
-- Performance-critical indexes
CREATE INDEX idx_datasets_tenant_status ON xase_voice_datasets(tenant_id, status);
CREATE INDEX idx_datasets_language ON xase_voice_datasets(primary_language);
CREATE INDEX idx_policies_client_status ON xase_voice_access_policies(client_tenant_id, status);
CREATE INDEX idx_leases_expiry ON xase_voice_access_leases(expires_at);
CREATE INDEX idx_access_logs_timestamp ON xase_voice_access_logs(timestamp);
CREATE INDEX idx_offers_published ON access_offers(status, published_at);
```

### Migration Strategy

- **Manual SQL migrations** (no Prisma Migrate)
- **Idempotent scripts** (IF NOT EXISTS, IF EXISTS)
- **Node.js execution** via `database/run-migration.js`
- **Version tracking** in migration files

---

## External Integrations

### Cloud Storage Providers

| Provider | OAuth | Streaming | Batch Download |
|----------|-------|-----------|----------------|
| AWS S3 | ✅ | ✅ | ✅ |
| GCS | ✅ | ✅ | ✅ |
| Azure Blob | ✅ | ✅ | ✅ |
| Snowflake | ✅ | ❌ | ✅ |
| BigQuery | ✅ | ❌ | ✅ |

### Authentication Providers

- **NextAuth Providers:** Credentials, OAuth (Google, GitHub)
- **2FA:** TOTP (otplib), backup codes
- **Password Reset:** Email-based tokens

---

## Deployment Architecture

### Production Environment

```
Load Balancer (HTTPS)
  ↓
Next.js App (Vercel/Docker)
  ↓
PostgreSQL (RDS/Cloud SQL)
  ↓
Redis (ElastiCache/Cloud Memorystore)
  ↓
S3/GCS (Evidence Bundles)
```

### Worker Processes

- **Audio Ingest Worker:** `src/workers/audio-ingest.ts`
- **Queue:** BullMQ + Redis
- **Concurrency:** Configurable per worker

### Monitoring

- **Health Check:** `/api/health`
- **Metrics:** `/api/metrics` (Prometheus-compatible)
- **Logs:** Structured JSON logs

---

## API Versioning

### External API (SDK)

- **Base Path:** `/api/v1/`
- **Authentication:** API Key header (`x-api-key`)
- **Rate Limiting:** Per API key (default: 1000 req/hour)
- **SDKs:**
  - JavaScript/TypeScript: `packages/sdk-js/`
  - Python: `packages/sdk-py/`

### Internal API

- **Base Path:** `/api/xase/`
- **Authentication:** NextAuth session
- **CSRF:** Required for mutations

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Database schema |
| `next.config.ts` | Next.js configuration |
| `src/middleware.ts` | Auth & routing middleware |
| `tailwind.config.ts` | Styling configuration |
| `tsconfig.json` | TypeScript configuration |
| `.env` | Environment variables |

---

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Run migrations
npm run xase:migrate

# Generate Prisma client
npx prisma generate

# Start dev server
npm run dev

# Start worker (separate terminal)
npm run worker:audio
```

### Testing

```bash
# Demo scripts
npm run demo:seed        # Seed test data
npm run demo:audit       # Run audit demo
npm run demo:full        # Full workflow demo

# Advanced demos
npm run demo2:seed       # Advanced insurance demo
npm run demo2:audit      # Advanced audit
```

---

## Performance Considerations

### Optimization Strategies

1. **Database:**
   - Indexed foreign keys
   - Partial indexes on status fields
   - Connection pooling (Prisma)

2. **Caching:**
   - Redis for session storage
   - API response caching (SWR)
   - Static asset CDN

3. **File Streaming:**
   - Presigned URLs (S3/GCS)
   - Chunked transfers
   - Range requests support

4. **Background Jobs:**
   - BullMQ for async processing
   - Retry logic with exponential backoff
   - Dead letter queues

---

## Scalability

### Horizontal Scaling

- **App Servers:** Stateless Next.js instances
- **Workers:** Multiple worker processes
- **Database:** Read replicas for analytics
- **Redis:** Redis Cluster for high availability

### Vertical Scaling

- **Database:** Increase connection pool
- **Workers:** Increase concurrency
- **Memory:** Optimize Prisma queries

---

## Future Roadmap

### Q1 2026 (Completed)
- ✅ Multi-source dataset aggregation
- ✅ OAuth integrations (AWS, GCS, Azure)
- ✅ Evidence bundle generation
- ✅ Marketplace (AccessOffer, PolicyExecution)

### Q2 2026 (Planned)
- 🔄 Federated query engine (row-level security)
- 🔄 Differential privacy (epsilon budgets)
- 🔄 Advanced analytics dashboard
- 🔄 Mobile app (React Native)

### Q3 2026 (Planned)
- 📋 Real-time collaboration
- 📋 Advanced consent management
- 📋 Regulatory compliance reports (GDPR, HIPAA)
- 📋 Enterprise SSO (SAML, OIDC)

---

## Glossary

- **AI Holder:** Organization that owns/manages voice datasets (Supplier)
- **AI Lab:** Organization seeking access to voice data (Buyer)
- **Dataset:** Aggregated collection of voice recordings
- **DataSource:** Single cloud storage location within a Dataset
- **Policy:** Access control rules for a Dataset
- **Lease:** Time-limited access token
- **Evidence Bundle:** Cryptographic proof of compliant data usage
- **Offer:** Marketplace listing for Dataset access
- **Execution:** Active instance of a Policy (tracks usage, cost)

---

## Contact & Support

- **Documentation:** `/docs/`
- **API Docs:** `/docs/architecture/EXTERNAL_API.md`
- **SDK Docs:** `/packages/sdk-js/DOCUMENTATION.md`
- **Issues:** GitHub Issues (if applicable)

---

**Document Version:** 2.0  
**Generated:** February 10, 2026  
**Maintained By:** Xase Engineering Team
