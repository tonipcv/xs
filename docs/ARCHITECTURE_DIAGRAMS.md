# Architecture Diagrams - Xase Sheets

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         XASE BRAIN (Cloud)                                   │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │   Next.js App    │  │   PostgreSQL     │  │   ClickHouse     │         │
│  │   (Frontend +    │  │   (Prisma ORM)   │  │   (Audit Logs)   │         │
│  │    API Routes)   │  │                  │  │                  │         │
│  │                  │  │  - Users         │  │  - Audit Events  │         │
│  │  - Dashboard     │  │  - Tenants       │  │  - Telemetry     │         │
│  │  - Datasets      │  │  - Datasets      │  │  - Metrics       │         │
│  │  - Policies      │  │  - Policies      │  │                  │         │
│  │  - Marketplace   │  │  - Offers        │  │                  │         │
│  │  - Leases        │  │  - Leases        │  │                  │         │
│  │  - Audit         │  │  - Executions    │  │                  │         │
│  │  - Evidence      │  │  - Evidence      │  │                  │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│           │                     │                     │                     │
│           └─────────────────────┴─────────────────────┘                     │
│                                 │                                           │
│                          REST API + Auth                                    │
│                          (NextAuth.js)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ HTTPS (Auth + Telemetry)
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                  │
        ▼                                                  ▼
┌───────────────────────────┐                  ┌───────────────────────────┐
│  SUPPLIER ENVIRONMENT     │                  │  CONSUMER ENVIRONMENT     │
│  (Hospital/Company)       │                  │  (AI Company)             │
│                           │                  │                           │
│  ┌─────────────────────┐ │                  │  ┌─────────────────────┐ │
│  │   Data Sources      │ │                  │  │   Training Pod      │ │
│  │                     │ │                  │  │                     │ │
│  │  - S3 Bucket        │ │                  │  │  ┌──────────────┐  │ │
│  │  - PACS (DICOMweb)  │ │                  │  │  │  PyTorch     │  │ │
│  │  - EHR (FHIR)       │ │                  │  │  │  Training    │  │ │
│  └─────────────────────┘ │                  │  │  └──────┬───────┘  │ │
│                           │                  │  │         │          │ │
└───────────────────────────┘                  │  │  ┌──────▼───────┐  │ │
                                               │  │  │  Xase        │  │ │
                                               │  │  │  Sidecar     │  │ │
                                               │  │  │  (Rust)      │  │ │
                                               │  │  │              │  │ │
                                               │  │  │ - Cache      │  │ │
                                               │  │  │ - Pipeline   │  │ │
                                               │  │  │ - Provider   │  │ │
                                               │  │  └──────────────┘  │ │
                                               │  └─────────────────────┘ │
                                               └───────────────────────────┘
```

## 2. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW SEQUENCE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

1. SETUP PHASE
   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │ Supplier │─────>│  Brain   │<─────│ Consumer │
   │          │      │          │      │          │
   │ Creates  │      │ Stores   │      │ Accepts  │
   │ Dataset  │      │ Policy   │      │ Offer    │
   │ & Policy │      │          │      │          │
   └──────────┘      └──────────┘      └──────────┘
                           │
                           │ Issues Lease
                           ▼
                     ┌──────────┐
                     │  Lease   │
                     │ Contract │
                     │ API Key  │
                     └──────────┘

2. TRAINING PHASE
   ┌──────────────┐
   │   Training   │
   │   Process    │
   └──────┬───────┘
          │ (1) Request segment
          │     via Unix socket
          ▼
   ┌──────────────┐
   │   Sidecar    │
   │ Socket Server│
   └──────┬───────┘
          │ (2) Check cache
          ▼
   ┌──────────────┐
   │ Segment      │◄─── Cache HIT: return immediately
   │ Cache        │
   └──────┬───────┘
          │ Cache MISS
          │ (3) Download
          ▼
   ┌──────────────┐
   │ DataProvider │
   │ (S3/PACS/    │
   │  FHIR)       │
   └──────┬───────┘
          │ (4) Raw data
          ▼
   ┌──────────────┐
   │ DataPipeline │
   │ (Deidentify) │
   └──────┬───────┘
          │ (5) Processed data
          ▼
   ┌──────────────┐
   │   Cache      │
   │   Store      │
   └──────┬───────┘
          │ (6) Return to training
          ▼
   ┌──────────────┐
   │   Training   │
   │   Process    │
   └──────────────┘

3. TELEMETRY PHASE
   ┌──────────────┐
   │   Sidecar    │
   │  Telemetry   │
   │    Loop      │
   └──────┬───────┘
          │ Every 30s
          │ (Metrics only, no data)
          ▼
   ┌──────────────┐
   │    Brain     │
   │   Records    │
   │   Usage      │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │   Billing    │
   │   Ledger     │
   └──────────────┘

4. EVIDENCE PHASE
   ┌──────────────┐
   │  Training    │
   │  Completes   │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │    Brain     │
   │  Generates   │
   │  Evidence    │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Merkle Tree  │
   │ + Signature  │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  Consumer    │
   │  Downloads   │
   │  Bundle      │
   └──────────────┘
```

## 3. Sidecar Internal Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         XASE SIDECAR (Rust)                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                        MAIN THREAD                                  │    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │ Config Load  │─>│ Auth Brain   │─>│ Init Cache   │            │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │ Init Provider│─>│ Init Pipeline│─>│ Spawn Tasks  │            │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     BACKGROUND TASKS (Tokio)                        │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │  Socket Server Task                                          │  │    │
│  │  │  - Listen on Unix socket                                     │  │    │
│  │  │  - Accept connections                                        │  │    │
│  │  │  - Spawn handler per connection                              │  │    │
│  │  │  - Serve segments (cache hit/miss)                           │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │  Prefetch Task                                               │  │    │
│  │  │  - List next segments                                        │  │    │
│  │  │  - Download in background                                    │  │    │
│  │  │  - Process through pipeline                                  │  │    │
│  │  │  - Populate cache                                            │  │    │
│  │  │  - Adaptive window sizing                                    │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │  Telemetry Task                                              │  │    │
│  │  │  - Collect metrics every 30s                                 │  │    │
│  │  │  - Send to Brain                                             │  │    │
│  │  │  - Update execution stats                                    │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │  Token Refresh Task                                          │  │    │
│  │  │  - Monitor token expiry                                      │  │    │
│  │  │  - Refresh at 80% lifetime                                   │  │    │
│  │  │  - Retry with exponential backoff                            │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │  Resilience Monitor Task                                     │  │    │
│  │  │  - Track auth health                                         │  │    │
│  │  │  - Enter cache-only mode if needed                           │  │    │
│  │  │  - Log warnings every 30s                                    │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │  Metrics Server Task (HTTP)                                  │  │    │
│  │  │  - Axum server on port 9090                                  │  │    │
│  │  │  - /metrics (Prometheus)                                     │  │    │
│  │  │  - /health (health check)                                    │  │    │
│  │  │  - /ready (readiness probe)                                  │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     SHARED STATE (Arc)                              │    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │ SegmentCache │  │ TokenRefresh │  │  Resilience  │            │    │
│  │  │  (DashMap)   │  │   (RwLock)   │  │  (AtomicBool)│            │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │ DataProvider │  │ DataPipeline │  │    Config    │            │    │
│  │  │   (trait)    │  │   (trait)    │  │   (Clone)    │            │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 4. Database Schema (ER Diagram)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│     User     │         │   Tenant     │         │   Dataset    │
├──────────────┤         ├──────────────┤         ├──────────────┤
│ id           │────┐    │ id           │────┐    │ id           │
│ email        │    │    │ name         │    │    │ name         │
│ name         │    │    │ email        │    │    │ dataType     │
│ tenantId     │────┼───>│ orgType      │    │    │ status       │
│ xaseRole     │    │    │ status       │    │    │ totalSize    │
│ 2faEnabled   │    │    │ plan         │    │    │ recordCount  │
└──────────────┘    │    └──────────────┘    │    │ tenantId     │────┐
                    │            │            │    └──────────────┘    │
                    │            │            │            │            │
                    │            │ 1:N        │            │ 1:N        │
                    │            │            │            │            │
                    │            ▼            │            ▼            │
                    │    ┌──────────────┐    │    ┌──────────────┐    │
                    │    │   ApiKey     │    │    │ DataSource   │    │
                    │    ├──────────────┤    │    ├──────────────┤    │
                    │    │ id           │    │    │ id           │    │
                    │    │ tenantId     │────┘    │ datasetId    │────┘
                    │    │ keyHash      │         │ sourceType   │
                    │    │ permissions  │         │ location     │
                    │    │ rateLimit    │         │ credentials  │
                    │    └──────────────┘         │ status       │
                    │                             └──────────────┘
                    │
                    │            ┌──────────────┐
                    │            │ AccessPolicy │
                    │            ├──────────────┤
                    │            │ id           │
                    │            │ tenantId     │────┐
                    │            │ datasetId    │────┼───┐
                    │            │ name         │    │   │
                    │            │ rules        │    │   │
                    │            │ epsilon      │    │   │
                    │            │ watermark    │    │   │
                    │            │ status       │    │   │
                    │            └──────────────┘    │   │
                    │                    │            │   │
                    │                    │ 1:N        │   │
                    │                    │            │   │
                    │                    ▼            │   │
                    │            ┌──────────────┐    │   │
                    │            │ AccessOffer  │    │   │
                    │            ├──────────────┤    │   │
                    │            │ id           │    │   │
                    │            │ supplierTId  │────┘   │
                    │            │ datasetId    │────────┘
                    │            │ policyId     │────┐
                    │            │ title        │    │
                    │            │ pricePerGb   │    │
                    │            │ pricePerHour │    │
                    │            │ status       │    │
                    │            │ visibility   │    │
                    │            └──────────────┘    │
                    │                    │            │
                    │                    │ 1:N        │
                    │                    │            │
                    │                    ▼            │
                    │            ┌──────────────┐    │
                    │            │    Lease     │    │
                    │            ├──────────────┤    │
                    │            │ id           │    │
                    │            │ offerId      │────┘
                    │            │ buyerTId     │────┐
                    │            │ contractId   │    │
                    │            │ status       │    │
                    │            │ startedAt    │    │
                    │            │ expiresAt    │    │
                    │            └──────────────┘    │
                    │                    │            │
                    │                    │ 1:N        │
                    │                    │            │
                    │                    ▼            │
                    │            ┌──────────────┐    │
                    │            │PolicyExec    │    │
                    │            ├──────────────┤    │
                    │            │ id           │    │
                    │            │ leaseId      │────┘
                    │            │ buyerTId     │────┐
                    │            │ policyId     │    │
                    │            │ status       │    │
                    │            │ bytesProc    │    │
                    │            │ redactions   │    │
                    │            │ costAccrued  │    │
                    │            └──────────────┘    │
                    │                    │            │
                    │                    │ 1:N        │
                    │                    │            │
                    │                    ▼            │
                    │            ┌──────────────┐    │
                    │            │EvidenceBundle│    │
                    │            ├──────────────┤    │
                    │            │ id           │    │
                    │            │ executionId  │────┘
                    │            │ merkleRoot   │
                    │            │ signature    │
                    │            │ metadata     │
                    │            └──────────────┘
                    │
                    └────────────────────────────────────────┐
                                                             │
                                                             ▼
                                                     ┌──────────────┐
                                                     │CreditLedger  │
                                                     ├──────────────┤
                                                     │ id           │
                                                     │ tenantId     │
                                                     │ amount       │
                                                     │ type         │
                                                     │ description  │
                                                     │ metadata     │
                                                     └──────────────┘
```

## 5. User Journey - Supplier

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SUPPLIER JOURNEY (Hospital)                               │
└─────────────────────────────────────────────────────────────────────────────┘

START
  │
  ▼
┌─────────────────┐
│ 1. Sign Up      │
│ - Email         │
│ - Company       │
│ - Org Type:     │
│   SUPPLIER      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Create       │
│    Dataset      │
│ - Name          │
│ - Type: DICOM   │
│ - Description   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Add Data     │
│    Source       │
│ - Type: PACS    │
│ - URL           │
│ - Credentials   │
│ - Test Connect  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Create       │
│    Policy       │
│ - Name: HIPAA   │
│ - Rules:        │
│   * Strip PHI   │
│   * Watermark   │
│ - Test Sample   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Create       │
│    Offer        │
│ - Title         │
│ - Price/GB      │
│ - Price/Hour    │
│ - Visibility    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. Publish      │
│    to Market    │
│ - Review        │
│ - Confirm       │
│ - Go Live       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 7. Monitor      │
│    Usage        │
│ - Active Leases │
│ - Bytes Served  │
│ - Revenue       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 8. Receive      │
│    Payment      │
│ - Monthly       │
│ - Auto-invoice  │
└─────────────────┘
```

## 6. User Journey - Consumer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONSUMER JOURNEY (AI Company)                             │
└─────────────────────────────────────────────────────────────────────────────┘

START
  │
  ▼
┌─────────────────┐
│ 1. Sign Up      │
│ - Email         │
│ - Company       │
│ - Org Type:     │
│   CLIENT        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Browse       │
│    Marketplace  │
│ - Search        │
│ - Filter        │
│ - Sort          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. View Offer   │
│    Details      │
│ - Dataset Info  │
│ - Policy Rules  │
│ - Sample Data   │
│ - Pricing       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Accept       │
│    Offer        │
│ - Duration: 7d  │
│ - Est. 100GB    │
│ - Confirm       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Receive      │
│    Credentials  │
│ - Lease ID      │
│ - API Key       │
│ - Contract ID   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. Install      │
│    Sidecar      │
│ - Helm install  │
│ - Set env vars  │
│ - Verify        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 7. Configure    │
│    Training     │
│ - SDK setup     │
│ - Socket path   │
│ - Test load     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 8. Train        │
│    Model        │
│ - Start job     │
│ - Monitor       │
│ - Complete      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 9. Download     │
│    Evidence     │
│ - Bundle ZIP    │
│ - Verify sigs   │
│ - Store         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 10. Renew or    │
│     Cancel      │
│ - Extend lease  │
│ - Or terminate  │
└─────────────────┘
```

## 7. Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                                      │
└─────────────────────────────────────────────────────────────────────────────┘

LAYER 1: NETWORK SECURITY
┌─────────────────────────────────────────────────────────────────────────────┐
│ - HTTPS/TLS 1.3 for all external communication                              │
│ - Network policies in Kubernetes                                            │
│ - Firewall rules (only necessary ports)                                     │
│ - DDoS protection (Cloudflare)                                              │
└─────────────────────────────────────────────────────────────────────────────┘

LAYER 2: AUTHENTICATION
┌─────────────────────────────────────────────────────────────────────────────┐
│ - NextAuth.js (session-based)                                               │
│ - 2FA/TOTP support                                                          │
│ - OAuth2 (Google, GitHub)                                                   │
│ - API Keys with rate limiting                                               │
│ - STS tokens for Sidecar (auto-refresh)                                     │
└─────────────────────────────────────────────────────────────────────────────┘

LAYER 3: AUTHORIZATION
┌─────────────────────────────────────────────────────────────────────────────┐
│ - Role-Based Access Control (RBAC)                                          │
│   * OWNER - Full access                                                     │
│   * ADMIN - Manage resources                                                │
│   * VIEWER - Read-only                                                      │
│ - Tenant isolation (row-level security)                                     │
│ - Resource ownership validation                                             │
└─────────────────────────────────────────────────────────────────────────────┘

LAYER 4: DATA PROTECTION
┌─────────────────────────────────────────────────────────────────────────────┐
│ - Encryption at rest (AES-256-GCM)                                          │
│ - Encryption in transit (TLS 1.3)                                           │
│ - Credentials encrypted in DB                                               │
│ - Secrets in Kubernetes Secrets                                             │
│ - No PHI/PII stored in Brain                                                │
└─────────────────────────────────────────────────────────────────────────────┘

LAYER 5: AUDIT & COMPLIANCE
┌─────────────────────────────────────────────────────────────────────────────┐
│ - Complete audit trail (ClickHouse)                                         │
│ - Immutable evidence (Merkle trees)                                         │
│ - Cryptographic signatures                                                  │
│ - Compliance reports (HIPAA, GDPR)                                          │
│ - Watermarking for leak detection                                           │
└─────────────────────────────────────────────────────────────────────────────┘

LAYER 6: RUNTIME GOVERNANCE
┌─────────────────────────────────────────────────────────────────────────────┐
│ - Sidecar processes data locally                                            │
│ - Policy enforcement at runtime                                             │
│ - Zero-knowledge architecture                                               │
│ - Data never leaves customer environment                                    │
│ - Telemetry is metrics only (no data)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 8. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KUBERNETES DEPLOYMENT                                     │
└─────────────────────────────────────────────────────────────────────────────┘

NAMESPACE: xase-training
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  POD: training-pod-1                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  CONTAINER: training                                                │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │ Image: pytorch/pytorch:2.0                                    │  │    │
│  │  │ Resources:                                                     │  │    │
│  │  │   - GPU: 1x A100                                              │  │    │
│  │  │   - Memory: 32Gi                                              │  │    │
│  │  │   - CPU: 8 cores                                              │  │    │
│  │  │ Volumes:                                                       │  │    │
│  │  │   - /var/run/xase (emptyDir - shared with sidecar)           │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                     │    │
│  │  CONTAINER: sidecar                                                 │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │ Image: xase/sidecar:2.0.0                                     │  │    │
│  │  │ Resources:                                                     │  │    │
│  │  │   - Memory: 100Gi (cache)                                     │  │    │
│  │  │   - CPU: 8 cores                                              │  │    │
│  │  │ Env:                                                           │  │    │
│  │  │   - CONTRACT_ID (from ConfigMap)                              │  │    │
│  │  │   - XASE_API_KEY (from Secret)                                │  │    │
│  │  │   - LEASE_ID (from ConfigMap)                                 │  │    │
│  │  │   - INGESTION_MODE=s3                                         │  │    │
│  │  │   - BUCKET_NAME (from ConfigMap)                              │  │    │
│  │  │ Volumes:                                                       │  │    │
│  │  │   - /var/run/xase (emptyDir - shared with training)          │  │    │
│  │  │ Ports:                                                         │  │    │
│  │  │   - 9090 (metrics)                                            │  │    │
│  │  │ Probes:                                                        │  │    │
│  │  │   - Liveness: /health                                         │  │    │
│  │  │   - Readiness: /ready                                         │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  SERVICE: sidecar-metrics                                                    │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Type: ClusterIP                                                     │    │
│  │ Port: 9090                                                          │    │
│  │ Selector: app=training-pod                                          │    │
│  │ Annotations:                                                        │    │
│  │   prometheus.io/scrape: "true"                                      │    │
│  │   prometheus.io/port: "9090"                                        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  CONFIGMAP: xase-config                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ CONTRACT_ID: ctr_abc123                                             │    │
│  │ LEASE_ID: lease_xyz789                                              │    │
│  │ BUCKET_NAME: my-training-data                                       │    │
│  │ INGESTION_MODE: s3                                                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  SECRET: xase-secrets                                                        │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ XASE_API_KEY: xase_pk_...                                           │    │
│  │ AWS_ACCESS_KEY_ID: AKIA...                                          │    │
│  │ AWS_SECRET_ACCESS_KEY: ...                                          │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘

NAMESPACE: monitoring
┌─────────────────────────────────────────────────────────────────────────────┐
│  DEPLOYMENT: prometheus                                                      │
│  - Scrapes sidecar metrics                                                   │
│  - Stores time-series data                                                   │
│                                                                              │
│  DEPLOYMENT: grafana                                                         │
│  - Visualizes metrics                                                        │
│  - Dashboards for cache, latency, etc.                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 9. Scaling Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HORIZONTAL SCALING                                   │
└─────────────────────────────────────────────────────────────────────────────┘

SINGLE TRAINING JOB
┌──────────────────┐
│  Training Pod    │
│  + Sidecar       │
│  (1 GPU)         │
└──────────────────┘

MULTI-GPU TRAINING (Data Parallel)
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Training Pod 1  │  │  Training Pod 2  │  │  Training Pod 3  │
│  + Sidecar       │  │  + Sidecar       │  │  + Sidecar       │
│  (1 GPU)         │  │  (1 GPU)         │  │  (1 GPU)         │
└──────────────────┘  └──────────────────┘  └──────────────────┘
         │                     │                     │
         └─────────────────────┴─────────────────────┘
                               │
                    Gradient Synchronization
                         (PyTorch DDP)

Each Sidecar:
- Independent cache (100GB)
- Independent data provider
- Independent telemetry
- Shared lease/contract

MULTI-TENANT PLATFORM
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Tenant 1                Tenant 2                Tenant 3                   │
│  ┌────────────┐          ┌────────────┐          ┌────────────┐            │
│  │ Training   │          │ Training   │          │ Training   │            │
│  │ Pod 1      │          │ Pod 1      │          │ Pod 1      │            │
│  │ + Sidecar  │          │ + Sidecar  │          │ + Sidecar  │            │
│  └────────────┘          └────────────┘          └────────────┘            │
│  ┌────────────┐          ┌────────────┐          ┌────────────┐            │
│  │ Training   │          │ Training   │          │ Training   │            │
│  │ Pod 2      │          │ Pod 2      │          │ Pod 2      │            │
│  │ + Sidecar  │          │ + Sidecar  │          │ + Sidecar  │            │
│  └────────────┘          └────────────┘          └────────────┘            │
│                                                                              │
│  Isolation:                                                                  │
│  - Namespace per tenant                                                      │
│  - Network policies                                                          │
│  - Resource quotas                                                           │
│  - Separate credentials                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 10. Disaster Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DISASTER RECOVERY SCENARIOS                               │
└─────────────────────────────────────────────────────────────────────────────┘

SCENARIO 1: Xase Brain Down
┌─────────────────────────────────────────────────────────────────────────────┐
│ Problem: Brain API unavailable                                               │
│                                                                              │
│ Solution: Cache-Only Mode                                                    │
│ 1. Sidecar detects auth failures                                            │
│ 2. Grace period: 5 minutes                                                  │
│ 3. Enter cache-only mode                                                    │
│ 4. Training continues with cached data                                      │
│ 5. When Brain recovers, sync telemetry                                      │
│                                                                              │
│ Impact: Zero downtime for training                                          │
│ Data Loss: None (telemetry queued)                                          │
└─────────────────────────────────────────────────────────────────────────────┘

SCENARIO 2: Data Source Down (S3/PACS)
┌─────────────────────────────────────────────────────────────────────────────┐
│ Problem: Cannot download new segments                                        │
│                                                                              │
│ Solution: Hybrid Provider Fallback                                          │
│ 1. Primary provider (PACS) fails                                            │
│ 2. Automatic fallback to S3                                                 │
│ 3. Training continues                                                       │
│                                                                              │
│ Impact: Slight latency increase                                             │
│ Data Loss: None                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

SCENARIO 3: Sidecar Crash
┌─────────────────────────────────────────────────────────────────────────────┐
│ Problem: Sidecar process crashes                                            │
│                                                                              │
│ Solution: Kubernetes Restart                                                │
│ 1. Liveness probe fails                                                     │
│ 2. Kubernetes restarts container                                            │
│ 3. Sidecar re-authenticates                                                 │
│ 4. Cache is rebuilt                                                         │
│ 5. Training resumes                                                         │
│                                                                              │
│ Impact: ~30s downtime                                                       │
│ Data Loss: Cache contents (rebuilt)                                         │
└─────────────────────────────────────────────────────────────────────────────┘

SCENARIO 4: Database Corruption
┌─────────────────────────────────────────────────────────────────────────────┐
│ Problem: PostgreSQL data corruption                                         │
│                                                                              │
│ Solution: Point-in-Time Recovery                                            │
│ 1. Detect corruption                                                        │
│ 2. Stop writes                                                              │
│ 3. Restore from WAL backup                                                  │
│ 4. Replay transactions                                                      │
│ 5. Resume operations                                                        │
│                                                                              │
│ Impact: <15 minutes downtime                                                │
│ Data Loss: <5 minutes of transactions                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**Versão:** 2.0.0  
**Data:** 19 de Fevereiro de 2026  
**Autor:** Equipe Xase Engineering
