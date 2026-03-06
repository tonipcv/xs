-- Migration 032: add delivery result columns to preparation_jobs
-- Ensures manifest/checksum/readme paths and signed URLs are persisted
-- Date: 2026-03-05

ALTER TABLE IF EXISTS preparation_jobs
  ADD COLUMN IF NOT EXISTS manifest_path TEXT,
  ADD COLUMN IF NOT EXISTS checksum_path TEXT,
  ADD COLUMN IF NOT EXISTS readme_path TEXT,
  ADD COLUMN IF NOT EXISTS download_urls JSONB,
  ADD COLUMN IF NOT EXISTS delivery_expires_at TIMESTAMPTZ;
