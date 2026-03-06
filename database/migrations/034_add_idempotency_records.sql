-- Migration: Add idempotency records table
-- Purpose: Support idempotent API requests with Idempotency-Key header
-- Date: 2026-03-06

-- Create idempotency_records table
CREATE TABLE IF NOT EXISTS idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) NOT NULL,
  dataset_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  job_id UUID NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Indexes for fast lookup
  CONSTRAINT idempotency_records_unique UNIQUE (idempotency_key, dataset_id, tenant_id)
);

-- Index for cleanup of expired records
CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires_at 
  ON idempotency_records(expires_at);

-- Index for lookup by idempotency key
CREATE INDEX IF NOT EXISTS idx_idempotency_records_key 
  ON idempotency_records(idempotency_key);

-- Index for lookup by job_id
CREATE INDEX IF NOT EXISTS idx_idempotency_records_job_id 
  ON idempotency_records(job_id);

-- Add foreign key to preparation_jobs if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'preparation_jobs') THEN
    ALTER TABLE idempotency_records
      ADD CONSTRAINT fk_idempotency_job
      FOREIGN KEY (job_id)
      REFERENCES preparation_jobs(id)
      ON DELETE CASCADE;
  END IF;
END $$;
