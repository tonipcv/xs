-- XASE Migration: Remove Checkpoints
-- Date: 2026-01-05
-- Idempotent: yes

BEGIN;

-- Drop checkpoint table if exists (cascade to constraints/indexes)
DROP TABLE IF EXISTS xase_checkpoint_records CASCADE;

COMMIT;
