-- Migration: Add PreparationJob table for data preparation pipeline
-- Date: 2026-03-04

CREATE TABLE IF NOT EXISTS preparation_jobs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  
  task TEXT NOT NULL,
  modality TEXT NOT NULL,
  runtime TEXT NOT NULL,
  format TEXT NOT NULL,
  
  config TEXT NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  
  output_path TEXT,
  manifest_url TEXT,
  error TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  CONSTRAINT fk_preparation_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  CONSTRAINT fk_preparation_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_preparation_jobs_dataset_id ON preparation_jobs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_preparation_jobs_tenant_id ON preparation_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_preparation_jobs_status ON preparation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_preparation_jobs_created_at ON preparation_jobs(created_at);
