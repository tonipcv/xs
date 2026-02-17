-- Ensure resource_type is NOT NULL in xase_audit_logs
-- This is a more aggressive fix to ensure the constraint is properly set

BEGIN;

-- First, ensure the column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'xase_audit_logs' 
    AND column_name = 'resource_type'
  ) THEN
    ALTER TABLE xase_audit_logs ADD COLUMN resource_type text;
  END IF;
END$$;

-- Backfill any NULL values with a default
UPDATE xase_audit_logs
SET resource_type = 'GENERIC'
WHERE resource_type IS NULL;

-- Set default for future inserts
ALTER TABLE xase_audit_logs 
  ALTER COLUMN resource_type SET DEFAULT 'GENERIC';

-- Enforce NOT NULL
ALTER TABLE xase_audit_logs 
  ALTER COLUMN resource_type SET NOT NULL;

COMMIT;
