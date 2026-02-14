-- Migration: create data_connectors table (idempotent)
-- Requires: PostgreSQL, DATABASE_URL set for script execution

CREATE TABLE IF NOT EXISTS data_connectors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  connection_string TEXT,
  credentials TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for one connector type per tenant
CREATE UNIQUE INDEX IF NOT EXISTS data_connectors_tenant_type_key
  ON data_connectors(tenant_id, type);

-- Lookup index by tenant
CREATE INDEX IF NOT EXISTS idx_data_connectors_tenant
  ON data_connectors(tenant_id);

-- Auto update updated_at support
CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Unique constraint for one connector type per tenant
CREATE UNIQUE INDEX IF NOT EXISTS data_connectors_tenant_type_key
  ON data_connectors(tenant_id, type);

-- Lookup index by tenant
CREATE INDEX IF NOT EXISTS idx_data_connectors_tenant
  ON data_connectors(tenant_id);

-- Trigger (re-create idempotently)
DROP TRIGGER IF EXISTS trg_data_connectors_updated_at ON data_connectors;
CREATE TRIGGER trg_data_connectors_updated_at
BEFORE UPDATE ON data_connectors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_now();
