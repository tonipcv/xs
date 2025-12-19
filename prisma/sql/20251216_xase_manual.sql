-- XASE CORE - Manual SQL Migration (PostgreSQL)
-- Run this against your Postgres database. Safe to re-run (IF NOT EXISTS guards).

-- =============================
-- 1) Policies table (xase_policies)
-- =============================
CREATE TABLE IF NOT EXISTS public.xase_policies (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  policy_id       TEXT NOT NULL,
  version         TEXT NOT NULL,
  document        TEXT NOT NULL,
  document_hash   TEXT NOT NULL,
  name            TEXT NULL,
  description     TEXT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at  TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for (tenant_id, policy_id, version)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xase_policies_tenant_policy_version_key'
  ) THEN
    ALTER TABLE public.xase_policies
      ADD CONSTRAINT xase_policies_tenant_policy_version_key UNIQUE (tenant_id, policy_id, version);
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS xase_policies_tenant_idx ON public.xase_policies (tenant_id);
CREATE INDEX IF NOT EXISTS xase_policies_policy_idx ON public.xase_policies (policy_id);
CREATE INDEX IF NOT EXISTS xase_policies_active_idx ON public.xase_policies (is_active);

-- =============================
-- 2) Decision records: add legal-grade metadata columns
-- =============================
-- Table name mapped from Prisma: xase_decision_records
ALTER TABLE public.xase_decision_records
  ADD COLUMN IF NOT EXISTS policy_hash         TEXT NULL,
  ADD COLUMN IF NOT EXISTS model_id            TEXT NULL,
  ADD COLUMN IF NOT EXISTS model_version       TEXT NULL,
  ADD COLUMN IF NOT EXISTS model_hash          TEXT NULL,
  ADD COLUMN IF NOT EXISTS feature_schema_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS explanation_json    TEXT NULL;

-- Optional indexes
CREATE INDEX IF NOT EXISTS xase_decision_records_model_idx ON public.xase_decision_records (model_id, model_version);
CREATE INDEX IF NOT EXISTS xase_decision_records_policy_hash_idx ON public.xase_decision_records (policy_hash);

-- =============================
-- 3) Evidence bundles table (xase_evidence_bundles)
-- =============================
CREATE TABLE IF NOT EXISTS public.xase_evidence_bundles (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  record_id       TEXT NOT NULL,
  bundle_id       TEXT NOT NULL,
  transaction_id  TEXT NOT NULL,
  storage_url     TEXT NULL,
  storage_key     TEXT NULL,
  bundle_hash     TEXT NOT NULL,
  bundle_size     INTEGER NULL,
  format          TEXT NOT NULL DEFAULT 'zip',
  includes_pdf    BOOLEAN NOT NULL DEFAULT FALSE,
  includes_payloads BOOLEAN NOT NULL DEFAULT TRUE,
  retention_until TIMESTAMPTZ NULL,
  legal_hold      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessed_at     TIMESTAMPTZ NULL
);

-- Uniqueness and indexes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xase_evidence_bundles_bundle_id_key'
  ) THEN
    ALTER TABLE public.xase_evidence_bundles
      ADD CONSTRAINT xase_evidence_bundles_bundle_id_key UNIQUE (bundle_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS xase_evidence_bundles_tenant_idx ON public.xase_evidence_bundles (tenant_id);
CREATE INDEX IF NOT EXISTS xase_evidence_bundles_record_idx ON public.xase_evidence_bundles (record_id);
CREATE INDEX IF NOT EXISTS xase_evidence_bundles_txn_idx ON public.xase_evidence_bundles (transaction_id);

-- (Optional) Foreign key relationships (assumes existing tenant/record tables)
-- Wrap in DO block to avoid failure if FKs already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xase_evidence_bundles_tenant_fk'
  ) THEN
    ALTER TABLE public.xase_evidence_bundles
      ADD CONSTRAINT xase_evidence_bundles_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES public.xase_tenants (id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xase_evidence_bundles_record_fk'
  ) THEN
    ALTER TABLE public.xase_evidence_bundles
      ADD CONSTRAINT xase_evidence_bundles_record_fk
      FOREIGN KEY (record_id) REFERENCES public.xase_decision_records (id) ON DELETE CASCADE;
  END IF;
END $$;

-- =============================
-- 4) Trigger to keep updated_at fresh (optional)
-- =============================
-- Create a simple trigger function if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'xase_touch_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.xase_touch_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END $$;

-- Attach triggers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'xase_policies_touch_updated_at'
  ) THEN
    CREATE TRIGGER xase_policies_touch_updated_at
    BEFORE UPDATE ON public.xase_policies
    FOR EACH ROW EXECUTE FUNCTION public.xase_touch_updated_at();
  END IF;
END $$;

-- =============================
-- End of manual migration
-- =============================
