-- Fix legacy camelCase columns on xase_audit_logs so Prisma inserts don't fail
-- Idempotent and non-destructive (only adds defaults / backfills)

BEGIN;

-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Ensure id has a default UUID (column type is text)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='xase_audit_logs' AND column_name='id' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE xase_audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
  END IF;
END$$;

-- 2) If legacy camelCase columns exist, make them safe
-- resourceType (NOT NULL with no default) is breaking inserts when Prisma targets resource_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='xase_audit_logs' AND column_name='"resourceType"'
  ) THEN
    -- Backfill from snake_case if available
    EXECUTE 'UPDATE xase_audit_logs SET "resourceType" = resource_type WHERE "resourceType" IS NULL AND resource_type IS NOT NULL';
    -- Set a safe default and keep NOT NULL
    EXECUTE 'ALTER TABLE xase_audit_logs ALTER COLUMN "resourceType" SET DEFAULT ''UNKNOWN''';
    EXECUTE 'ALTER TABLE xase_audit_logs ALTER COLUMN "resourceType" SET NOT NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='xase_audit_logs' AND column_name='resourceType'
  ) THEN
    UPDATE xase_audit_logs SET "resourceType" = resource_type WHERE "resourceType" IS NULL AND resource_type IS NOT NULL;
    ALTER TABLE xase_audit_logs ALTER COLUMN "resourceType" SET DEFAULT 'UNKNOWN';
    ALTER TABLE xase_audit_logs ALTER COLUMN "resourceType" SET NOT NULL;
  END IF;
END$$;

-- 3) Also ensure snake_case resource_type has default/NOT NULL (defensive)
ALTER TABLE xase_audit_logs ALTER COLUMN resource_type SET DEFAULT 'UNKNOWN';
ALTER TABLE xase_audit_logs ALTER COLUMN resource_type SET NOT NULL;

COMMIT;
