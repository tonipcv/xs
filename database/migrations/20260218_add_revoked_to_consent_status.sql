-- Add REVOKED to consent_status enum in an idempotent way
-- Safe to run multiple times

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'consent_status'
  ) THEN
    -- Create enum if it doesn't exist (fresh database cases)
    CREATE TYPE consent_status AS ENUM ('PENDING', 'VERIFIED_BY_XASE', 'SELF_DECLARED', 'MISSING', 'REVOKED');
  ELSE
    -- Ensure REVOKED exists
    ALTER TYPE consent_status ADD VALUE IF NOT EXISTS 'REVOKED';
  END IF;
END
$$;
