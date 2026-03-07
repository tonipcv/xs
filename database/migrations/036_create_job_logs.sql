-- Migration: Create job_logs table for persisting job logs
-- Created: 2025-03-06

CREATE TABLE IF NOT EXISTS job_logs (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    level VARCHAR(50) NOT NULL, -- debug, info, warn, error
    message TEXT NOT NULL,
    context JSONB,
    step VARCHAR(100), -- normalization, compilation, delivery
    progress INTEGER, -- 0-100
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_tenant_id ON job_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_level ON job_logs(level);
CREATE INDEX IF NOT EXISTS idx_job_logs_created_at ON job_logs(created_at);

-- Foreign key constraint
ALTER TABLE job_logs 
    ADD CONSTRAINT fk_job_logs_preparation_job 
    FOREIGN KEY (job_id) 
    REFERENCES preparation_jobs(id) 
    ON DELETE CASCADE;
