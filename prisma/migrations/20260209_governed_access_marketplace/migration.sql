-- ========================================
-- GOVERNED ACCESS MARKETPLACE MIGRATION
-- ========================================
-- This migration creates the core tables for the canonical Xase architecture:
-- 1. AccessOffer: Templates for governed access (what's in the catalog)
-- 2. PolicyExecution: Runtime instances of access contracts (what's purchased)
-- 3. AccessReview: Audit feedback on policy executions (trust signals)

-- ========================================
-- 1. CREATE ENUMS
-- ========================================

-- Risk classification for datasets/offers
CREATE TYPE "risk_class" AS ENUM (
  'LOW',        -- Public data, low sensitivity
  'MEDIUM',     -- Business data, moderate sensitivity
  'HIGH',       -- PII, healthcare, financial
  'CRITICAL'    -- Highly regulated (HIPAA PHI, etc)
);

-- Offer lifecycle status
CREATE TYPE "offer_status" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'REVOKED'
);

-- Policy execution lifecycle
CREATE TYPE "execution_status" AS ENUM (
  'ACTIVE',
  'COMPLETED',
  'EXPIRED',
  'REVOKED',
  'AUDITED'
);

-- Pricing models for access
CREATE TYPE "price_model" AS ENUM (
  'PAY_PER_HOUR',           -- Charge per hour of usage
  'PAY_PER_REQUEST',        -- Charge per API request
  'FIXED_LEASE',            -- Fixed price for time-boxed access
  'TIERED'                  -- Volume-based pricing tiers
);

-- ========================================
-- 2. ACCESS OFFERS TABLE
-- ========================================

CREATE TABLE "access_offers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offer_id" TEXT NOT NULL UNIQUE,
  
  -- References
  "dataset_id" TEXT NOT NULL,
  "supplier_tenant_id" TEXT NOT NULL,
  
  -- Offer details
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  
  -- Access contract (executable rules)
  "allowed_purposes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "constraints" JSONB NOT NULL DEFAULT '{}'::JSONB,
  
  -- Legal guarantees
  "jurisdiction" TEXT NOT NULL,
  "evidence_format" TEXT NOT NULL DEFAULT 'CRYPTOGRAPHIC_AUDIT_BUNDLE',
  "compliance_level" TEXT NOT NULL DEFAULT 'SELF_DECLARED',
  
  -- Scope
  "scope_hours" DOUBLE PRECISION NOT NULL,
  "scope_recordings" INTEGER,
  
  -- Pricing
  "price_model" "price_model" NOT NULL DEFAULT 'PAY_PER_HOUR',
  "price_per_hour" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  
  -- Trust signals (precedent, not ratings)
  "successful_audits" INTEGER NOT NULL DEFAULT 0,
  "total_executions" INTEGER NOT NULL DEFAULT 0,
  "average_compliance" DOUBLE PRECISION,
  
  -- Metadata for discovery
  "language" TEXT NOT NULL,
  "use_cases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "risk_class" "risk_class" NOT NULL DEFAULT 'MEDIUM',
  
  -- Sample metadata (NOT files, just metadata)
  "sample_metadata" JSONB,
  
  -- Lifecycle
  "status" "offer_status" NOT NULL DEFAULT 'DRAFT',
  "published_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign keys
  CONSTRAINT "access_offers_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "xase_voice_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "access_offers_supplier_tenant_id_fkey" FOREIGN KEY ("supplier_tenant_id") REFERENCES "xase_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes for performance
CREATE INDEX "access_offers_status_published_at_idx" ON "access_offers"("status", "published_at");
CREATE INDEX "access_offers_language_risk_class_idx" ON "access_offers"("language", "risk_class");
CREATE INDEX "access_offers_successful_audits_idx" ON "access_offers"("successful_audits" DESC);
CREATE INDEX "access_offers_supplier_tenant_id_idx" ON "access_offers"("supplier_tenant_id");

-- ========================================
-- 3. POLICY EXECUTIONS TABLE
-- ========================================

CREATE TABLE "policy_executions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "execution_id" TEXT NOT NULL UNIQUE,
  
  -- References
  "offer_id" TEXT NOT NULL,
  "buyer_tenant_id" TEXT NOT NULL,
  "policy_id" TEXT NOT NULL,
  "lease_id" TEXT NOT NULL,
  
  -- Access contract snapshot (from offer at execution time)
  "allowed_purposes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "constraints" JSONB NOT NULL DEFAULT '{}'::JSONB,
  
  -- Usage tracking (runtime!)
  "hours_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "bytes_streamed" BIGINT NOT NULL DEFAULT 0,
  
  -- Financial
  "total_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  
  -- Evidence generation
  "evidence_bundle_url" TEXT,
  "evidence_hash" TEXT,
  "evidence_generated_at" TIMESTAMP(3),
  
  -- Lifecycle
  "status" "execution_status" NOT NULL DEFAULT 'ACTIVE',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  
  -- Foreign keys
  CONSTRAINT "policy_executions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "access_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "policy_executions_buyer_tenant_id_fkey" FOREIGN KEY ("buyer_tenant_id") REFERENCES "xase_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "policy_executions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "xase_voice_access_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "policy_executions_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "xase_voice_access_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes for performance
CREATE INDEX "policy_executions_buyer_tenant_id_idx" ON "policy_executions"("buyer_tenant_id");
CREATE INDEX "policy_executions_status_expires_at_idx" ON "policy_executions"("status", "expires_at");
CREATE INDEX "policy_executions_offer_id_idx" ON "policy_executions"("offer_id");

-- ========================================
-- 4. ACCESS REVIEWS TABLE
-- ========================================

CREATE TABLE "access_reviews" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offer_id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL UNIQUE,
  "buyer_tenant_id" TEXT NOT NULL,
  
  -- Review metrics (about LEGAL UTILITY, not "nice audio")
  "policy_clarity_rating" INTEGER NOT NULL CHECK ("policy_clarity_rating" >= 1 AND "policy_clarity_rating" <= 5),
  "access_reliability_rating" INTEGER NOT NULL CHECK ("access_reliability_rating" >= 1 AND "access_reliability_rating" <= 5),
  "evidence_quality_rating" INTEGER NOT NULL CHECK ("evidence_quality_rating" >= 1 AND "evidence_quality_rating" <= 5),
  
  -- Regulator acceptance (was it accepted in audit?)
  "regulator_accepted" BOOLEAN,
  "regulator_name" TEXT,
  
  -- Audit outcome
  "audit_successful" BOOLEAN,
  "audit_feedback" TEXT,
  
  -- Overall
  "overall_rating" INTEGER NOT NULL CHECK ("overall_rating" >= 1 AND "overall_rating" <= 5),
  "review" TEXT,
  "used_for" TEXT,
  
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign keys
  CONSTRAINT "access_reviews_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "access_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "access_reviews_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "policy_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "access_reviews_buyer_tenant_id_fkey" FOREIGN KEY ("buyer_tenant_id") REFERENCES "xase_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes for performance
CREATE INDEX "access_reviews_offer_id_idx" ON "access_reviews"("offer_id");
CREATE INDEX "access_reviews_buyer_tenant_id_idx" ON "access_reviews"("buyer_tenant_id");

-- ========================================
-- 5. UPDATE EXISTING TABLES
-- ========================================

-- Add risk_class to xase_voice_datasets (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'xase_voice_datasets' AND column_name = 'risk_class') THEN
    ALTER TABLE "xase_voice_datasets" ADD COLUMN "risk_class" "risk_class" DEFAULT 'MEDIUM';
  END IF;
END $$;

-- ========================================
-- 6. TRIGGERS FOR UPDATED_AT
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_access_offers_updated_at
  BEFORE UPDATE ON "access_offers"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
-- Next steps:
-- 1. Run: npx prisma db push (to apply this migration)
-- 2. Run: npx prisma generate (to update Prisma Client)
-- 3. Implement APIs for access offers
-- 4. Build catalog UI
