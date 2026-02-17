-- Add semantic columns to xase_voice_datasets
-- Idempotent, safe to run multiple times

BEGIN;

-- Add semantic columns if not exists
ALTER TABLE IF EXISTS xase_voice_datasets
  ADD COLUMN IF NOT EXISTS call_type text,
  ADD COLUMN IF NOT EXISTS intent_cluster text,
  ADD COLUMN IF NOT EXISTS emotion_band text,
  ADD COLUMN IF NOT EXISTS outcome_flag text;

COMMIT;
