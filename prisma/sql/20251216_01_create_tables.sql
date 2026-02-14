-- XASE CORE - SQL Migration (Step 1: Tables + Columns + Basic Indexes)
-- PostgreSQL only

-- 1) xase_policies
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

-- Basic indexes (safe if table exists)
CREATE INDEX IF NOT EXISTS xase_policies_tenant_idx ON public.xase_policies (tenant_id);
CREATE INDEX IF NOT EXISTS xase_policies_policy_idx ON public.xase_policies (policy_id);
CREATE INDEX IF NOT EXISTS xase_policies_active_idx ON public.xase_policies (is_active);

-- 2) Add legal-grade columns to xase_decision_records
ALTER TABLE public.xase_decision_records
  ADD COLUMN IF NOT EXISTS policy_hash         TEXT NULL,
  ADD COLUMN IF NOT EXISTS model_id            TEXT NULL,
  ADD COLUMN IF NOT EXISTS model_version       TEXT NULL,
  ADD COLUMN IF NOT EXISTS model_hash          TEXT NULL,
  ADD COLUMN IF NOT EXISTS feature_schema_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS explanation_json    TEXT NULL;

CREATE INDEX IF NOT EXISTS xase_decision_records_model_idx ON public.xase_decision_records (model_id, model_version);
CREATE INDEX IF NOT EXISTS xase_decision_records_policy_hash_idx ON public.xase_decision_records (policy_hash);

-- 3) xase_evidence_bundles (optional but recommended)
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

CREATE UNIQUE INDEX IF NOT EXISTS xase_evidence_bundles_bundle_id_key ON public.xase_evidence_bundles (bundle_id);
CREATE INDEX IF NOT EXISTS xase_evidence_bundles_tenant_idx ON public.xase_evidence_bundles (tenant_id);
CREATE INDEX IF NOT EXISTS xase_evidence_bundles_record_idx ON public.xase_evidence_bundles (record_id);
CREATE INDEX IF NOT EXISTS xase_evidence_bundles_txn_idx ON public.xase_evidence_bundles (transaction_id);
