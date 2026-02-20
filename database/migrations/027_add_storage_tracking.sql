-- Migration: Add Storage Tracking for Billing
-- Description: Adds storage snapshot tracking and storage-related fields to support GB-hours billing

-- Create storage snapshots table to track storage usage over time
CREATE TABLE IF NOT EXISTS xase_storage_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  dataset_id TEXT,
  lease_id TEXT,
  
  -- Storage metrics
  storage_bytes BIGINT NOT NULL DEFAULT 0,
  storage_gb DECIMAL(15, 4) NOT NULL DEFAULT 0,
  
  -- Snapshot metadata
  snapshot_type TEXT NOT NULL DEFAULT 'PERIODIC', -- PERIODIC, LEASE_START, LEASE_END, MANUAL
  snapshot_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Billing period tracking
  billing_period TEXT, -- Format: YYYY-MM
  hours_in_period DECIMAL(10, 2) DEFAULT 1.0, -- Hours this snapshot represents
  
  -- Calculated GB-hours
  gb_hours DECIMAL(15, 4) GENERATED ALWAYS AS (storage_gb * hours_in_period) STORED,
  
  -- Metadata
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_storage_snapshots_tenant ON xase_storage_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_storage_snapshots_dataset ON xase_storage_snapshots(dataset_id);
CREATE INDEX IF NOT EXISTS idx_storage_snapshots_lease ON xase_storage_snapshots(lease_id);
CREATE INDEX IF NOT EXISTS idx_storage_snapshots_timestamp ON xase_storage_snapshots(snapshot_timestamp);
CREATE INDEX IF NOT EXISTS idx_storage_snapshots_billing_period ON xase_storage_snapshots(billing_period);
CREATE INDEX IF NOT EXISTS idx_storage_snapshots_type ON xase_storage_snapshots(snapshot_type);

-- Conditionally add foreign key constraints only if referenced tables exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_tenants'
  ) THEN
    BEGIN
      ALTER TABLE xase_storage_snapshots
      ADD CONSTRAINT fk_storage_tenant FOREIGN KEY (tenant_id)
      REFERENCES xase_tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- constraint already exists
      NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_datasets'
  ) THEN
    BEGIN
      ALTER TABLE xase_storage_snapshots
      ADD CONSTRAINT fk_storage_dataset FOREIGN KEY (dataset_id)
      REFERENCES xase_datasets(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_access_leases'
  ) THEN
    BEGIN
      ALTER TABLE xase_storage_snapshots
      ADD CONSTRAINT fk_storage_lease FOREIGN KEY (lease_id)
      REFERENCES xase_access_leases(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END;
$$;

-- Add storage tracking fields to PolicyExecution
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'xase_policy_executions'
  ) THEN
    ALTER TABLE xase_policy_executions 
      ADD COLUMN IF NOT EXISTS storage_gb_hours DECIMAL(15, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS peak_storage_gb DECIMAL(15, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS avg_storage_gb DECIMAL(15, 4) DEFAULT 0;
  END IF;
END;
$$;

-- Add storage cost tracking to CreditLedger metadata
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_credit_ledger' AND column_name = 'metadata'
  ) THEN
    COMMENT ON COLUMN xase_credit_ledger.metadata IS 'JSON metadata including storage_gb_hours, compute_hours, bytes_processed, etc.';
  END IF;
END;
$$;

-- Create view for monthly storage aggregation
CREATE OR REPLACE VIEW v_monthly_storage_usage AS
SELECT 
  tenant_id,
  billing_period,
  dataset_id,
  SUM(gb_hours) as total_gb_hours,
  AVG(storage_gb) as avg_storage_gb,
  MAX(storage_gb) as peak_storage_gb,
  COUNT(*) as snapshot_count,
  MIN(snapshot_timestamp) as period_start,
  MAX(snapshot_timestamp) as period_end
FROM xase_storage_snapshots
WHERE billing_period IS NOT NULL
GROUP BY tenant_id, billing_period, dataset_id;

-- Create view for real-time storage by tenant
CREATE OR REPLACE VIEW v_current_storage_by_tenant AS
WITH latest_snapshots AS (
  SELECT DISTINCT ON (tenant_id, dataset_id)
    tenant_id,
    dataset_id,
    storage_gb,
    snapshot_timestamp
  FROM xase_storage_snapshots
  ORDER BY tenant_id, dataset_id, snapshot_timestamp DESC
)
SELECT 
  tenant_id,
  SUM(storage_gb) as total_storage_gb,
  COUNT(DISTINCT dataset_id) as dataset_count,
  MAX(snapshot_timestamp) as last_updated
FROM latest_snapshots
GROUP BY tenant_id;

-- Function to calculate storage GB-hours between two timestamps
CREATE OR REPLACE FUNCTION calculate_storage_gb_hours(
  p_tenant_id TEXT,
  p_start_timestamp TIMESTAMP,
  p_end_timestamp TIMESTAMP
) RETURNS DECIMAL(15, 4) AS $$
DECLARE
  v_total_gb_hours DECIMAL(15, 4);
BEGIN
  SELECT COALESCE(SUM(gb_hours), 0)
  INTO v_total_gb_hours
  FROM xase_storage_snapshots
  WHERE tenant_id = p_tenant_id
    AND snapshot_timestamp >= p_start_timestamp
    AND snapshot_timestamp <= p_end_timestamp;
  
  RETURN v_total_gb_hours;
END;
$$ LANGUAGE plpgsql;

-- Function to create periodic storage snapshot
CREATE OR REPLACE FUNCTION create_storage_snapshot(
  p_tenant_id TEXT,
  p_dataset_id TEXT DEFAULT NULL,
  p_lease_id TEXT DEFAULT NULL,
  p_storage_bytes BIGINT DEFAULT 0,
  p_snapshot_type TEXT DEFAULT 'PERIODIC',
  p_billing_period TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_snapshot_id TEXT;
  v_storage_gb DECIMAL(15, 4);
  v_billing_period TEXT;
BEGIN
  -- Generate snapshot ID
  v_snapshot_id := 'ss_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || substr(md5(random()::text), 1, 8);
  
  -- Calculate GB
  v_storage_gb := p_storage_bytes / 1073741824.0; -- 1024^3
  
  -- Determine billing period if not provided
  IF p_billing_period IS NULL THEN
    v_billing_period := TO_CHAR(NOW(), 'YYYY-MM');
  ELSE
    v_billing_period := p_billing_period;
  END IF;
  
  -- Insert snapshot
  INSERT INTO xase_storage_snapshots (
    id,
    tenant_id,
    dataset_id,
    lease_id,
    storage_bytes,
    storage_gb,
    snapshot_type,
    snapshot_timestamp,
    billing_period,
    hours_in_period,
    metadata
  ) VALUES (
    v_snapshot_id,
    p_tenant_id,
    p_dataset_id,
    p_lease_id,
    p_storage_bytes,
    v_storage_gb,
    p_snapshot_type,
    NOW(),
    v_billing_period,
    1.0, -- Default 1 hour
    jsonb_build_object(
      'created_by', 'system',
      'snapshot_version', '1.0'
    )
  );
  
  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON v_monthly_storage_usage TO PUBLIC;
GRANT SELECT ON v_current_storage_by_tenant TO PUBLIC;
