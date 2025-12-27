-- Fix unique constraint for enqueue ON CONFLICT
-- Replace partial unique index with a proper UNIQUE constraint on (dedupe_key)
-- Postgres allows multiple NULLs in UNIQUE, so partial index is not needed.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = ANY(current_schemas(true)) AND indexname = 'uq_xase_jobs_dedupe'
  ) THEN
    DROP INDEX IF EXISTS uq_xase_jobs_dedupe;
  END IF;
END $$;

ALTER TABLE xase_jobs
  ADD CONSTRAINT uq_xase_jobs_dedupe_key UNIQUE (dedupe_key);

COMMIT;
