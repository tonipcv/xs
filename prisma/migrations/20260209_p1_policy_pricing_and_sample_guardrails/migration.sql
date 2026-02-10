-- P1: Remove pricing from VoiceAccessPolicy and add sample_metadata guardrail
-- Safe re-run with IF EXISTS / IF NOT EXISTS where possible

-- 1) Remove pricing fields from VoiceAccessPolicy (policy should be pure enforcement)
ALTER TABLE "xase_voice_access_policies"
  DROP COLUMN IF EXISTS "price_per_hour",
  DROP COLUMN IF EXISTS "currency";

-- 2) Guardrail: prevent raw URLs/paths in access_offers.sample_metadata
--    Allowed: metrics, hashes, synthetic flags, etc.
--    Block: values that look like gs://, s3://, http(s):// anywhere in the JSON
-- Note: Requires PostgreSQL with jsonpath (v12+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'access_offers_sample_metadata_no_urls_chk'
  ) THEN
    ALTER TABLE "access_offers"
      ADD CONSTRAINT access_offers_sample_metadata_no_urls_chk
      CHECK (
        sample_metadata IS NULL
        OR NOT jsonb_path_exists(sample_metadata, '$.** ? (@ like_regex "^(gs|s3|https?)://")')
      );
  END IF;
END$$;
