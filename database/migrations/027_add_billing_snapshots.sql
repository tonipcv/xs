-- Migration: Add billing_snapshots table for historical billing metrics
-- Created: 2026-02-24
-- Purpose: Store daily snapshots of Sidecar billing metrics for reporting and invoicing

CREATE TABLE IF NOT EXISTS billing_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sidecar_url TEXT NOT NULL,
  snapshot_date TIMESTAMPTZ NOT NULL,
  period TEXT NOT NULL, -- YYYY-MM format
  
  -- Billing counters
  dicom_images DOUBLE PRECISION NOT NULL DEFAULT 0,
  fhir_resources DOUBLE PRECISION NOT NULL DEFAULT 0,
  audio_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  text_pages DOUBLE PRECISION NOT NULL DEFAULT 0,
  bytes_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  redactions_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  
  -- Sidecar metadata
  sidecar_version TEXT,
  ingestion_mode TEXT,
  data_pipeline TEXT,
  
  -- Features enabled
  feature_dicom_ocr BOOLEAN NOT NULL DEFAULT FALSE,
  feature_fhir_nlp BOOLEAN NOT NULL DEFAULT FALSE,
  feature_audio_redaction BOOLEAN NOT NULL DEFAULT FALSE,
  feature_prefetch BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_billing_snapshot_tenant FOREIGN KEY (tenant_id) REFERENCES xase_tenants(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_billing_snapshots_tenant_period ON billing_snapshots(tenant_id, period);
CREATE INDEX IF NOT EXISTS idx_billing_snapshots_snapshot_date ON billing_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_billing_snapshots_tenant_date ON billing_snapshots(tenant_id, snapshot_date DESC);

-- Comment
COMMENT ON TABLE billing_snapshots IS 'Daily snapshots of Sidecar billing metrics for hybrid pricing model';
COMMENT ON COLUMN billing_snapshots.period IS 'Billing period in YYYY-MM format for monthly aggregation';
COMMENT ON COLUMN billing_snapshots.dicom_images IS 'Total DICOM images processed (for billing at R$ per 1k images)';
COMMENT ON COLUMN billing_snapshots.fhir_resources IS 'Total FHIR resources processed (for billing at R$ per 1k resources)';
COMMENT ON COLUMN billing_snapshots.audio_minutes IS 'Total audio minutes processed (for billing at R$ per 100 minutes)';
COMMENT ON COLUMN billing_snapshots.text_pages IS 'Total text pages processed (for billing at R$ per 1k pages)';
