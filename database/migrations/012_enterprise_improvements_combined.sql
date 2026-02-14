-- Migration 012: Enterprise-Grade Improvements (Combined)
-- Description: All enterprise improvements in one idempotent migration
-- Version: 1.0
-- Date: 2026-02-10

-- ========================================
-- 1. CREATE SIDECAR TABLES (if not exist)
-- ========================================

CREATE TABLE IF NOT EXISTS watermark_configs (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  parameters JSONB NOT NULL,
  robustness_level TEXT NOT NULL CHECK (robustness_level IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watermark_contract ON watermark_configs(contract_id);

CREATE TABLE IF NOT EXISTS sidecar_sessions (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  client_tenant_id TEXT NOT NULL,
  dataset_id TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'killed', 'completed')) DEFAULT 'active',
  total_bytes_served BIGINT DEFAULT 0,
  total_segments_served INT DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sidecar_lease ON sidecar_sessions(lease_id);
CREATE INDEX IF NOT EXISTS idx_sidecar_tenant ON sidecar_sessions(client_tenant_id);
CREATE INDEX IF NOT EXISTS idx_sidecar_status ON sidecar_sessions(status, last_heartbeat);

CREATE TABLE IF NOT EXISTS evidence_merkle_trees (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  root_hash TEXT NOT NULL,
  tree_data JSONB NOT NULL,
  leaf_count INT NOT NULL,
  proof_size_bytes INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_merkle_execution ON evidence_merkle_trees(execution_id);
CREATE INDEX IF NOT EXISTS idx_merkle_root ON evidence_merkle_trees(root_hash);

CREATE TABLE IF NOT EXISTS watermark_detections (
  id TEXT PRIMARY KEY,
  audio_hash TEXT NOT NULL,
  detected_contract_id TEXT,
  confidence_score FLOAT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  detection_method TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detection_contract ON watermark_detections(detected_contract_id);
CREATE INDEX IF NOT EXISTS idx_detection_hash ON watermark_detections(audio_hash);
CREATE INDEX IF NOT EXISTS idx_detection_timestamp ON watermark_detections(detected_at DESC);

CREATE TABLE IF NOT EXISTS sidecar_metrics (
  id BIGSERIAL PRIMARY KEY,
  sidecar_session_id TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('throughput', 'latency', 'cache_hit_rate', 'error_rate')),
  metric_value FLOAT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_session ON sidecar_metrics(sidecar_session_id, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON sidecar_metrics(metric_type, window_start DESC);

CREATE TABLE IF NOT EXISTS execution_contract_snapshots (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  raw_contract JSONB NOT NULL,
  contract_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_execution ON execution_contract_snapshots(execution_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_hash ON execution_contract_snapshots(contract_hash);

-- ========================================
-- 2. ADD TRUST LAYER FIELDS
-- ========================================

ALTER TABLE sidecar_sessions 
ADD COLUMN IF NOT EXISTS attestation_report JSONB,
ADD COLUMN IF NOT EXISTS attested BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS binary_hash TEXT,
ADD COLUMN IF NOT EXISTS trust_level TEXT DEFAULT 'SELF_REPORTED';

CREATE INDEX IF NOT EXISTS idx_sidecar_trust ON sidecar_sessions(trust_level, attested);

ALTER TABLE policy_executions
ADD COLUMN IF NOT EXISTS execution_trust_level TEXT DEFAULT 'SELF_REPORTED';

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

-- Drop old column if exists and add new JSONB column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_voice_access_policies' 
    AND column_name = 'allowed_environment'
    AND data_type != 'jsonb'
  ) THEN
    ALTER TABLE xase_voice_access_policies DROP COLUMN allowed_environment;
  END IF;
END $$;

ALTER TABLE xase_voice_access_policies
ADD COLUMN IF NOT EXISTS allowed_environment JSONB;

CREATE INDEX IF NOT EXISTS idx_policy_env_gin ON xase_voice_access_policies USING GIN (allowed_environment);

-- ========================================
-- 6. ADD BILLING ATOMICITY
-- ========================================

ALTER TABLE xase_credit_ledger
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_idempotency ON xase_credit_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE policy_executions
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_idempotency ON policy_executions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ========================================
-- 7. ADD WATERMARK DETECTION SIGNATURE
-- ========================================

ALTER TABLE watermark_detections
ADD COLUMN IF NOT EXISTS detection_signature TEXT,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

-- ========================================
-- 8. ENABLE ROW LEVEL SECURITY (RLS)
-- ========================================

DO $$
BEGIN
  -- Datasets: uses tenant_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_voice_datasets') THEN
    EXECUTE 'ALTER TABLE xase_voice_datasets ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_datasets ON xase_voice_datasets';
    EXECUTE 'CREATE POLICY tenant_isolation_datasets ON xase_voice_datasets USING (tenant_id = current_setting(''app.current_tenant'', true)::text)';
  END IF;

  -- Policies: uses client_tenant_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_voice_access_policies') THEN
    EXECUTE 'ALTER TABLE xase_voice_access_policies ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_policies ON xase_voice_access_policies';
    EXECUTE 'CREATE POLICY tenant_isolation_policies ON xase_voice_access_policies USING (client_tenant_id = current_setting(''app.current_tenant'', true)::text)';
  END IF;

  -- Leases: uses client_tenant_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_voice_access_leases') THEN
    EXECUTE 'ALTER TABLE xase_voice_access_leases ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_leases ON xase_voice_access_leases';
    EXECUTE 'CREATE POLICY tenant_isolation_leases ON xase_voice_access_leases USING (client_tenant_id = current_setting(''app.current_tenant'', true)::text)';
  END IF;

  -- Executions: uses buyer_tenant_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'policy_executions') THEN
    EXECUTE 'ALTER TABLE policy_executions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_executions ON policy_executions';
    EXECUTE 'CREATE POLICY tenant_isolation_executions ON policy_executions USING (buyer_tenant_id = current_setting(''app.current_tenant'', true)::text)';
  END IF;

  -- Credit ledger: uses organization_id (mapped from tenantId)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_credit_ledger') THEN
    EXECUTE 'ALTER TABLE xase_credit_ledger ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_credits ON xase_credit_ledger';
    EXECUTE 'CREATE POLICY tenant_isolation_credits ON xase_credit_ledger USING (organization_id = current_setting(''app.current_tenant'', true)::text)';
  END IF;

  -- Access offers: only if supplier_tenant_id exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'access_offers' AND column_name = 'supplier_tenant_id'
  ) THEN
    EXECUTE 'ALTER TABLE access_offers ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_offers ON access_offers';
    EXECUTE 'CREATE POLICY tenant_isolation_offers ON access_offers USING (supplier_tenant_id = current_setting(''app.current_tenant'', true)::text)';
  END IF;
END $$;
