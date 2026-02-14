-- Add PostgreSQL ENUM types to align with Prisma enums and alter columns
-- Safe and idempotent

BEGIN;

-- 1) Create enum types if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'xase_snapshot_type') THEN
    CREATE TYPE xase_snapshot_type AS ENUM ('EXTERNAL_DATA','BUSINESS_RULES','ENVIRONMENT','FEATURE_VECTOR');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'xase_insurance_claim_type') THEN
    CREATE TYPE xase_insurance_claim_type AS ENUM ('AUTO','HEALTH','LIFE','PROPERTY','LIABILITY','TRAVEL');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'xase_decision_consumer_impact') THEN
    CREATE TYPE xase_decision_consumer_impact AS ENUM ('LOW','MEDIUM','HIGH');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'xase_decision_type') THEN
    CREATE TYPE xase_decision_type AS ENUM ('CLAIM','UNDERWRITING','FRAUD','PRICING','OTHER');
  END IF;
END$$;

-- 2) Alter columns to use enum types (only if table/column exists)
-- EvidenceSnapshot.type -> xase_snapshot_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_evidence_snapshots' AND column_name = 'type'
  ) THEN
    ALTER TABLE xase_evidence_snapshots
      ALTER COLUMN type TYPE xase_snapshot_type USING type::xase_snapshot_type;
  END IF;
END$$;

-- InsuranceDecision.claim_type -> xase_insurance_claim_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_insurance_decisions' AND column_name = 'claim_type'
  ) THEN
    ALTER TABLE xase_insurance_decisions
      ALTER COLUMN claim_type TYPE xase_insurance_claim_type USING claim_type::xase_insurance_claim_type;
  END IF;
END$$;

-- InsuranceDecision.decision_impact_consumer -> xase_decision_consumer_impact
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_insurance_decisions' AND column_name = 'decision_impact_consumer'
  ) THEN
    ALTER TABLE xase_insurance_decisions
      ALTER COLUMN decision_impact_consumer TYPE xase_decision_consumer_impact USING decision_impact_consumer::xase_decision_consumer_impact;
  END IF;
END$$;

-- DecisionRecord.decision_type -> xase_decision_type (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_decision_records' AND column_name = 'decision_type'
  ) THEN
    ALTER TABLE xase_decision_records
      ALTER COLUMN decision_type TYPE xase_decision_type USING decision_type::xase_decision_type;
  END IF;
END$$;

COMMIT;
