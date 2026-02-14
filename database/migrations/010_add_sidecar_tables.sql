-- Migration 010: Add Sidecar Tables
-- Description: Add tables for Sidecar architecture (WatermarkConfig, TelemetryLog, SidecarSession, EvidenceMerkleTree)
-- Version: 1.0
-- Date: 2026-02-10

-- ========================================
-- WATERMARK CONFIGURATION
-- ========================================

CREATE TABLE IF NOT EXISTS watermark_configs (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  algorithm TEXT NOT NULL, -- 'spread_spectrum_v1'
  parameters JSONB NOT NULL,
  robustness_level TEXT NOT NULL CHECK (robustness_level IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watermark_contract ON watermark_configs(contract_id);

-- ========================================
-- TELEMETRY LOGS (High-volume)
-- ========================================

CREATE TABLE IF NOT EXISTS telemetry_logs (
  id BIGSERIAL PRIMARY KEY,
  sidecar_session_id TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL CHECK (event_type IN ('download', 'watermark', 'serve', 'cache_hit', 'cache_miss', 'error')),
  bytes_processed BIGINT,
  latency_ms INT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_logs(sidecar_session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_logs(event_type);

-- ========================================
-- SIDECAR SESSIONS
-- ========================================

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

-- Add foreign key if xase_voice_access_leases exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_voice_access_leases') THEN
    ALTER TABLE sidecar_sessions 
    ADD CONSTRAINT fk_sidecar_lease 
    FOREIGN KEY (lease_id) 
    REFERENCES xase_voice_access_leases(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- ========================================
-- EVIDENCE MERKLE TREES
-- ========================================

CREATE TABLE IF NOT EXISTS evidence_merkle_trees (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  root_hash TEXT NOT NULL,
  tree_data JSONB NOT NULL, -- compressed tree structure
  leaf_count INT NOT NULL,
  proof_size_bytes INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_merkle_execution ON evidence_merkle_trees(execution_id);
CREATE INDEX IF NOT EXISTS idx_merkle_root ON evidence_merkle_trees(root_hash);

-- Add foreign key if policy_executions exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'policy_executions') THEN
    ALTER TABLE evidence_merkle_trees 
    ADD CONSTRAINT fk_merkle_execution 
    FOREIGN KEY (execution_id) 
    REFERENCES policy_executions(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- ========================================
-- WATERMARK DETECTIONS (Forensics)
-- ========================================

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

-- ========================================
-- SIDECAR METRICS (Aggregated)
-- ========================================

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

-- ========================================
-- AUDIT: Log migration execution
-- ========================================

-- (Intencionalmente removido) Não registrar em xase_audit_logs para evitar falhas quando a coluna id for NOT NULL sem default.
