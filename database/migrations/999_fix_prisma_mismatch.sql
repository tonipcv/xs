-- XASE - Prisma/DB Schema Reconciliation
-- Idempotent SQL to align Postgres schema with prisma/schema.prisma
-- Safe to run multiple times

BEGIN;

-- 1) xase_voice_datasets.language (non-null in Prisma)
ALTER TABLE IF EXISTS xase_voice_datasets
  ADD COLUMN IF NOT EXISTS language text;

-- Backfill nulls with a sane default, then enforce NOT NULL
UPDATE xase_voice_datasets
   SET language = 'en-US'
 WHERE language IS NULL;

-- Add NOT NULL constraint if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'xase_voice_datasets'
    AND    column_name  = 'language'
    AND    is_nullable  = 'NO'
  ) THEN
    ALTER TABLE xase_voice_datasets ALTER COLUMN language SET NOT NULL;
  END IF;
END$$;

-- 2) xase_voice_datasets.cloud_integration_id (nullable in Prisma)
ALTER TABLE IF EXISTS xase_voice_datasets
  ADD COLUMN IF NOT EXISTS cloud_integration_id text;

-- Optional FK to cloud_integrations(id), if table exists and FK not present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cloud_integrations'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   information_schema.table_constraints tc
      JOIN   information_schema.key_column_usage kcu
      ON     tc.constraint_name = kcu.constraint_name
      WHERE  tc.table_schema = 'public'
      AND    tc.table_name = 'xase_voice_datasets'
      AND    tc.constraint_type = 'FOREIGN KEY'
      AND    kcu.column_name = 'cloud_integration_id'
    ) THEN
      ALTER TABLE xase_voice_datasets
        ADD CONSTRAINT xase_voice_datasets_cloud_integration_id_fkey
        FOREIGN KEY (cloud_integration_id)
        REFERENCES cloud_integrations(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

-- 3) xase_audit_logs.error_message (nullable in Prisma)
ALTER TABLE IF EXISTS xase_audit_logs
  ADD COLUMN IF NOT EXISTS error_message text;

COMMIT;
