-- Xase - UK Insurance Extension Migration (PostgreSQL)
-- Idempotent DDL to extend schema without breaking existing data
-- Run via: node database/run-migration.js

BEGIN;

-- 1) EvidenceSnapshot table (new)
CREATE TABLE IF NOT EXISTS xase_evidence_snapshots (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  type             TEXT NOT NULL,
  storage_url      TEXT NOT NULL,
  storage_key      TEXT NOT NULL,
  payload_hash     TEXT NOT NULL,
  payload_size     INTEGER,
  source_meta      TEXT,
  captured_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  compressed       BOOLEAN NOT NULL DEFAULT FALSE,
  compression_algo TEXT,
  CONSTRAINT fk_evidence_snapshots_tenant
    FOREIGN KEY (tenant_id) REFERENCES xase_tenants(id) ON DELETE CASCADE
);

-- Indexes for EvidenceSnapshot
CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_tenant ON xase_evidence_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_type ON xase_evidence_snapshots(type);
CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_captured_at ON xase_evidence_snapshots(captured_at);
CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_payload_hash ON xase_evidence_snapshots(payload_hash);

-- 2) InsuranceDecision table (new)
CREATE TABLE IF NOT EXISTS xase_insurance_decisions (
  id                           TEXT PRIMARY KEY,
  record_id                    TEXT NOT NULL UNIQUE,
  claim_number                 TEXT,
  claim_type                   TEXT,
  claim_amount                 NUMERIC(15,2),
  claim_date                   TIMESTAMPTZ,
  policy_number                TEXT,
  policy_holder_id_hash        TEXT,
  insured_amount               NUMERIC(15,2),
  risk_score                   DOUBLE PRECISION,
  underwriting_decision        TEXT,
  premium_calculated           NUMERIC(15,2),
  coverage_offered_json        TEXT,
  decision_outcome             TEXT,
  decision_outcome_reason      TEXT,
  decision_impact_financial    NUMERIC(15,2),
  decision_impact_consumer     TEXT,
  decision_impact_appealable   BOOLEAN,
  regulatory_case_id           TEXT,
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_ins_dec_record
    FOREIGN KEY (record_id) REFERENCES xase_decision_records(id) ON DELETE CASCADE
);

-- Indexes for InsuranceDecision
CREATE INDEX IF NOT EXISTS idx_ins_dec_claim_number ON xase_insurance_decisions(claim_number);
CREATE INDEX IF NOT EXISTS idx_ins_dec_policy_number ON xase_insurance_decisions(policy_number);
CREATE INDEX IF NOT EXISTS idx_ins_dec_claim_type ON xase_insurance_decisions(claim_type);
CREATE INDEX IF NOT EXISTS idx_ins_dec_claim_date ON xase_insurance_decisions(claim_date);

-- 3) DecisionRecord extensions
-- Note: table name is xase_decision_records; add columns if not exists
ALTER TABLE xase_decision_records
  ADD COLUMN IF NOT EXISTS external_data_snapshot_id    TEXT,
  ADD COLUMN IF NOT EXISTS business_rules_snapshot_id   TEXT,
  ADD COLUMN IF NOT EXISTS environment_snapshot_id      TEXT,
  ADD COLUMN IF NOT EXISTS feature_vector_snapshot_id   TEXT,
  ADD COLUMN IF NOT EXISTS data_timestamp               TIMESTAMPTZ;

-- Unique constraints per tenant
DO $$
BEGIN
  -- Drop any global unique on recordHash if it exists (name may vary across environments)
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'xase_decision_records'
      AND c.contype = 'u'
      AND c.conname LIKE '%recordhash%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE xase_decision_records DROP CONSTRAINT ' || quote_ident(c.conname)
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'xase_decision_records'
        AND c.contype = 'u'
        AND c.conname LIKE '%recordhash%'
      LIMIT 1
    );
  END IF;
END$$;

-- Ensure tenantId + recordHash is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'xase_decision_records_tenant_recordhash_key'
  ) THEN
    ALTER TABLE xase_decision_records
      ADD CONSTRAINT xase_decision_records_tenant_recordhash_key
      UNIQUE ("tenantId", "recordHash");
  END IF;
END$$;

-- Ensure tenantId + transactionId is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'xase_decision_records_tenant_transactionid_key'
  ) THEN
    ALTER TABLE xase_decision_records
      ADD CONSTRAINT xase_decision_records_tenant_transactionid_key
      UNIQUE ("tenantId", "transactionId");
  END IF;
END$$;

-- 4) CheckpointRecord extensions (QTSP / e-Seal / Blockchain)
ALTER TABLE xase_checkpoint_records
  ADD COLUMN IF NOT EXISTS qtsp_provider           TEXT,
  ADD COLUMN IF NOT EXISTS qtsp_timestamp_token   TEXT,
  ADD COLUMN IF NOT EXISTS qtsp_certificate_chain TEXT,
  ADD COLUMN IF NOT EXISTS eseal_signature        TEXT,
  ADD COLUMN IF NOT EXISTS eseal_certificate      TEXT,
  ADD COLUMN IF NOT EXISTS public_key_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS blockchain_network     TEXT,
  ADD COLUMN IF NOT EXISTS blockchain_tx_hash     TEXT,
  ADD COLUMN IF NOT EXISTS blockchain_anchor_at   TIMESTAMPTZ;

-- 5) EvidenceBundle extensions (legal format, PDF, custody, manifest, blockchain)
ALTER TABLE xase_evidence_bundles
  ADD COLUMN IF NOT EXISTS legal_format                  TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS pdf_report_url                TEXT,
  ADD COLUMN IF NOT EXISTS pdf_report_hash               TEXT,
  ADD COLUMN IF NOT EXISTS pdf_report_logical_hash       TEXT,
  ADD COLUMN IF NOT EXISTS chain_of_custody_report_json  TEXT,
  ADD COLUMN IF NOT EXISTS bundle_manifest_hash          TEXT,
  ADD COLUMN IF NOT EXISTS merkle_root                   TEXT,
  ADD COLUMN IF NOT EXISTS blockchain_network            TEXT,
  ADD COLUMN IF NOT EXISTS blockchain_tx_hash            TEXT,
  ADD COLUMN IF NOT EXISTS blockchain_anchor_at          TIMESTAMPTZ;

COMMIT;
