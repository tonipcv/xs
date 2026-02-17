-- Ensure resource_type in xase_audit_logs is NOT NULL with sensible default
-- Idempotent and safe
BEGIN;

-- Add column if missing (should exist)
ALTER TABLE IF EXISTS xase_audit_logs
  ADD COLUMN IF NOT EXISTS resource_type text;

-- Backfill NULLs to a default
UPDATE xase_audit_logs
   SET resource_type = COALESCE(resource_type, 'GENERIC')
 WHERE resource_type IS NULL;

-- Ensure NOT NULL constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'xase_audit_logs' AND column_name = 'resource_type' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE xase_audit_logs ALTER COLUMN resource_type SET NOT NULL;
  END IF;
END$$;

COMMIT;
