-- P2: Dataset legacy cleanup (backfill + drop legacy columns)
-- Safe to run once; uses IF EXISTS and CASCADE where needed

-- 1) Backfill primary_language from legacy language when empty
UPDATE "xase_voice_datasets"
SET "primary_language" = COALESCE("primary_language", "language")
WHERE "primary_language" IS NULL;

-- 2) Drop legacy columns (use CASCADE to remove dependent FKs/Indexes)
ALTER TABLE "xase_voice_datasets"
  DROP COLUMN IF EXISTS "language" CASCADE,
  DROP COLUMN IF EXISTS "storage_location" CASCADE,
  DROP COLUMN IF EXISTS "storage_size" CASCADE,
  DROP COLUMN IF EXISTS "cloud_integration_id" CASCADE,
  DROP COLUMN IF EXISTS "data_connector_id" CASCADE,
  DROP COLUMN IF EXISTS "dataset_hash" CASCADE,
  DROP COLUMN IF EXISTS "call_type" CASCADE,
  DROP COLUMN IF EXISTS "intent_cluster" CASCADE,
  DROP COLUMN IF EXISTS "emotion_band" CASCADE,
  DROP COLUMN IF EXISTS "outcome_flag" CASCADE;
