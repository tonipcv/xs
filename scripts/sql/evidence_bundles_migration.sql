-- Evidence Bundles: direct SQL migration (PostgreSQL)
-- Idempotent operations using IF NOT EXISTS and safe ALTERs
-- Requires: PostgreSQL 9.6+

BEGIN;

-- 1) Relax NOT NULL constraints to support multi-record bundles and optional fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_evidence_bundles' AND column_name = 'record_id'
  ) THEN
    EXECUTE 'ALTER TABLE xase_evidence_bundles ALTER COLUMN record_id DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_evidence_bundles' AND column_name = 'transaction_id'
  ) THEN
    EXECUTE 'ALTER TABLE xase_evidence_bundles ALTER COLUMN transaction_id DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_evidence_bundles' AND column_name = 'bundle_hash'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE xase_evidence_bundles ALTER COLUMN bundle_hash DROP NOT NULL';
    EXCEPTION WHEN undefined_column THEN
      -- Column may not exist yet; ignore
      NULL;
    END;
  END IF;
END$$;

-- 2) New columns for async lifecycle and compliance metadata
ALTER TABLE xase_evidence_bundles
  ADD COLUMN IF NOT EXISTS status         text        NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS purpose        text,
  ADD COLUMN IF NOT EXISTS description    text,
  ADD COLUMN IF NOT EXISTS record_count   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_from      timestamptz,
  ADD COLUMN IF NOT EXISTS date_to        timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at     timestamptz,
  ADD COLUMN IF NOT EXISTS created_by     text        NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz;

-- 3) New indexes for query performance
CREATE INDEX IF NOT EXISTS idx_xeb_status      ON xase_evidence_bundles (status);
CREATE INDEX IF NOT EXISTS idx_xeb_created_by  ON xase_evidence_bundles (created_by);

COMMIT;

-- Verification queries (optional)
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name='xase_evidence_bundles' ORDER BY ordinal_position;
-- \d xase_evidence_bundles;
