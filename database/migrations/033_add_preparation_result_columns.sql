-- Migration 033: store normalization / compilation / delivery JSON results
-- Ensures PreparationJob keeps full PreparationResult payload
-- Date: 2026-03-05

ALTER TABLE IF EXISTS preparation_jobs
  ADD COLUMN IF NOT EXISTS normalization_result JSONB,
  ADD COLUMN IF NOT EXISTS compilation_result JSONB,
  ADD COLUMN IF NOT EXISTS delivery_result JSONB;
