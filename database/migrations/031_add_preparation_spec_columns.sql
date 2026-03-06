-- Migration: add license/privacy/output columns to preparation_jobs
-- Ensures PreparationSpec contract fields are persisted
-- Date: 2026-03-05

ALTER TABLE IF EXISTS preparation_jobs
  ADD COLUMN IF NOT EXISTS license JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS preparation_jobs
  ADD COLUMN IF NOT EXISTS privacy JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS preparation_jobs
  ADD COLUMN IF NOT EXISTS output_contract JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill existing rows with empty objects for consistency
UPDATE preparation_jobs
SET license = COALESCE(license, '{}'::jsonb),
    privacy = COALESCE(privacy, '{}'::jsonb),
    output_contract = COALESCE(output_contract, '{}'::jsonb);
