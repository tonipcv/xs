-- Migration 011: Enterprise-Grade Improvements
-- Description: RLS, partitioning, trust layer, versioning, soft delete, billing atomicity
-- Version: 1.0
-- Date: 2026-02-10

-- ========================================
-- 1. SEPARATE TELEMETRY TO TIMESCALEDB
-- ========================================

-- Drop TelemetryLog from main Prisma (will be moved to TimescaleDB)
-- Keep only aggregated metrics in main DB
DROP TABLE IF EXISTS telemetry_logs CASCADE;

-- Keep SidecarMetric for aggregated rollups (stays in Prisma)
-- Already exists, no changes needed

-- ========================================
-- 2. ADD TRUST LAYER
-- ========================================

-- Add attestation fields to SidecarSession
ALTER TABLE sidecar_sessions 
ADD COLUMN IF NOT EXISTS attestation_report JSONB,
ADD COLUMN IF NOT EXISTS attested BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS binary_hash TEXT,
ADD COLUMN IF NOT EXISTS trust_level TEXT DEFAULT 'SELF_REPORTED' CHECK (trust_level IN ('SELF_REPORTED', 'ATTESTED', 'VERIFIED'));

CREATE INDEX IF NOT EXISTS idx_sidecar_trust ON sidecar_sessions(trust_level, attested);

-- Add trust level to PolicyExecution
ALTER TABLE policy_executions
ADD COLUMN IF NOT EXISTS execution_trust_level TEXT DEFAULT 'SELF_REPORTED' CHECK (execution_trust_level IN ('SELF_REPORTED', 'ATTESTED', 'VERIFIED'));

CREATE INDEX IF NOT EXISTS idx_execution_trust ON policy_executions(execution_trust_level);

-- ========================================
-- 3. ADD VERSIONING TO POLICIES
-- ========================================

ALTER TABLE xase_voice_access_policies
ADD COLUMN IF NOT EXISTS version INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS superseded_by_id TEXT,
ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_policy_version ON xase_voice_access_policies(version);
CREATE INDEX IF NOT EXISTS idx_policy_superseded ON xase_voice_access_policies(superseded_by_id);

-- ========================================
-- 4. ADD SOFT DELETE PATTERN
-- ========================================

-- Add deletedAt to critical tables
ALTER TABLE xase_voice_datasets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE xase_voice_access_policies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE xase_voice_access_leases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE policy_executions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE access_offers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sidecar_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dataset_deleted ON xase_voice_datasets(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_policy_deleted ON xase_voice_access_policies(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lease_deleted ON xase_voice_access_leases(deleted_at) WHERE deleted_at IS NULL;

-- ========================================
-- 5. NORMALIZE ENVIRONMENT ENFORCEMENT
-- ========================================

-- Upgrade allowedEnvironment to JSONB
ALTER TABLE xase_voice_access_policies
DROP COLUMN IF EXISTS allowed_environment,
ADD COLUMN IF NOT EXISTS allowed_environment JSONB;

-- Example structure:
-- {
--   "k8sCluster": "hash",
--   "instanceType": ["p5.48xlarge"],
--   "region": "us-east-1",
--   "requiresAttestation": true
-- }

CREATE INDEX IF NOT EXISTS idx_policy_env_gin ON xase_voice_access_policies USING GIN (allowed_environment);

-- ========================================
-- 6. ADD BILLING ATOMICITY
-- ========================================

-- Add idempotency key to CreditLedger
ALTER TABLE xase_credit_ledger
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_credit_idempotency ON xase_credit_ledger(idempotency_key);

-- Add idempotency key to PolicyExecution
ALTER TABLE policy_executions
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_execution_idempotency ON policy_executions(idempotency_key);

-- ========================================
-- 7. ADD EXECUTION CONTRACT SNAPSHOT
-- ========================================

CREATE TABLE IF NOT EXISTS execution_contract_snapshots (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  raw_contract JSONB NOT NULL,
  contract_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_execution ON execution_contract_snapshots(execution_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_hash ON execution_contract_snapshots(contract_hash);

-- Add foreign key if policy_executions exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'policy_executions') THEN
    ALTER TABLE execution_contract_snapshots 
    ADD CONSTRAINT fk_snapshot_execution 
    FOREIGN KEY (execution_id) 
    REFERENCES policy_executions(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- ========================================
-- 8. PARTITION AudioSegment BY datasetId
-- ========================================

-- Add composite index for better query performance
CREATE INDEX IF NOT EXISTS idx_audio_segment_dataset_id ON xase_audio_segments(dataset_id, segment_id);

-- Note: For true partitioning, would need to recreate table with PARTITION BY
-- This is a non-breaking improvement for now

-- ========================================
-- 9. ENABLE ROW LEVEL SECURITY (RLS)
-- ========================================

-- Enable RLS on tenant-scoped tables
ALTER TABLE xase_voice_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE xase_voice_access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE xase_voice_access_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE xase_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_offers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
CREATE POLICY tenant_isolation_datasets
ON xase_voice_datasets
USING (tenant_id = current_setting('app.current_tenant', true)::text);

CREATE POLICY tenant_isolation_policies
ON xase_voice_access_policies
USING (supplier_tenant_id = current_setting('app.current_tenant', true)::text 
    OR client_tenant_id = current_setting('app.current_tenant', true)::text);

CREATE POLICY tenant_isolation_leases
ON xase_voice_access_leases
USING (client_tenant_id = current_setting('app.current_tenant', true)::text);

CREATE POLICY tenant_isolation_executions
ON policy_executions
USING (buyer_tenant_id = current_setting('app.current_tenant', true)::text);

CREATE POLICY tenant_isolation_credits
ON xase_credit_ledger
USING (tenant_id = current_setting('app.current_tenant', true)::text);

CREATE POLICY tenant_isolation_offers
ON access_offers
USING (supplier_tenant_id = current_setting('app.current_tenant', true)::text);

-- ========================================
-- 10. ADD WATERMARK DETECTION SIGNATURE
-- ========================================

ALTER TABLE watermark_detections
ADD COLUMN IF NOT EXISTS detection_signature TEXT,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

-- ========================================
-- AUDIT LOG
-- ========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_audit_logs') THEN
    INSERT INTO xase_audit_logs (
      tenant_id,
      action,
      resource_type,
      resource_id,
      metadata,
      status,
      timestamp
    ) VALUES (
      NULL,
      'MIGRATION_EXECUTED',
      'DATABASE',
      '011_enterprise_grade_improvements',
      '{"version": "1.0", "changes": ["RLS", "trust_layer", "versioning", "soft_delete", "billing_atomicity", "telemetry_separation"]}',
      'SUCCESS',
      NOW()
    );
  END IF;
END $$;
