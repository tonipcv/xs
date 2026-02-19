-- Migration: Create ROPARecord table for LGPD compliance
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS xase_ropa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  dataset_id TEXT NOT NULL,
  
  -- ROPA core fields
  controller TEXT NOT NULL,
  processing_purpose TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  data_categories TEXT[] NOT NULL DEFAULT '{}',
  recipients TEXT[],
  dpo_contact TEXT,
  retention_period TEXT,
  
  -- Metadata
  record_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_ropa_tenant FOREIGN KEY (tenant_id) REFERENCES xase_tenants(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ropa_tenant ON xase_ropa_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ropa_dataset ON xase_ropa_records(dataset_id);
CREATE INDEX IF NOT EXISTS idx_ropa_legal_basis ON xase_ropa_records(legal_basis);
CREATE INDEX IF NOT EXISTS idx_ropa_created ON xase_ropa_records(created_at);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ropa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ropa_updated_at ON xase_ropa_records;
CREATE TRIGGER trigger_ropa_updated_at
  BEFORE UPDATE ON xase_ropa_records
  FOR EACH ROW
  EXECUTE FUNCTION update_ropa_updated_at();
