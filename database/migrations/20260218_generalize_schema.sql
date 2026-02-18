-- XASE: Generalize voice-specific schema to multi-modal (idempotent)
-- Safe to re-run. No destructive drops. Uses conditional guards.

-- 1) Rename tables from voice-specific to generic
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND c.relname = 'xase_voice_datasets'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_datasets'
  ) THEN
    ALTER TABLE xase_voice_datasets RENAME TO xase_datasets;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_audio_segments'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_data_assets'
  ) THEN
    ALTER TABLE xase_audio_segments RENAME TO xase_data_assets;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_voice_access_policies'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_access_policies'
  ) THEN
    ALTER TABLE xase_voice_access_policies RENAME TO xase_access_policies;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_voice_access_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_access_logs'
  ) THEN
    ALTER TABLE xase_voice_access_logs RENAME TO xase_access_logs;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_voice_access_leases'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'xase_access_leases'
  ) THEN
    ALTER TABLE xase_voice_access_leases RENAME TO xase_access_leases;
  END IF;
END $$;

-- 2) Create new enums for multi-modal typing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_type') THEN
    CREATE TYPE data_type AS ENUM ('AUDIO','IMAGE','TEXT','TIMESERIES','TABULAR');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_format') THEN
    CREATE TYPE data_format AS ENUM ('WAV','MP3','DICOM','NIFTI','FHIR_JSON','HL7_V2','CSV','PARQUET');
  END IF;
END $$;

-- 3) Add generic columns to data assets table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'xase_data_assets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name='xase_data_assets' AND column_name='data_type'
    ) THEN
      ALTER TABLE xase_data_assets ADD COLUMN data_type data_type;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name='xase_data_assets' AND column_name='data_format'
    ) THEN
      ALTER TABLE xase_data_assets ADD COLUMN data_format data_format;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name='xase_data_assets' AND column_name='metadata'
    ) THEN
      ALTER TABLE xase_data_assets ADD COLUMN metadata jsonb;
    END IF;
  END IF;
END $$;

-- 4) Create a new generic access_action enum and remap logs if needed
DO $$
DECLARE
  col_type text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_action') THEN
    CREATE TYPE access_action AS ENUM ('BATCH_DOWNLOAD','STREAM_ACCESS','METADATA_VIEW','POLICY_CHECK');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='xase_access_logs') THEN
    SELECT t.typname INTO col_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE c.relname = 'xase_access_logs' AND a.attname = 'action' AND a.attnum > 0;

    IF col_type = 'voice_access_action' THEN
      ALTER TABLE xase_access_logs
        ALTER COLUMN action TYPE access_action USING action::text::access_action;
    END IF;
  END IF;
END $$;

-- 5) Add policy/regulatory columns to access_policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='xase_access_policies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name='xase_access_policies' AND column_name='regulatory_frameworks'
    ) THEN
      ALTER TABLE xase_access_policies ADD COLUMN regulatory_frameworks text[] DEFAULT ARRAY[]::text[];
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name='xase_access_policies' AND column_name='de_identification_level'
    ) THEN
      ALTER TABLE xase_access_policies ADD COLUMN de_identification_level text;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name='xase_access_policies' AND column_name='hipaa_category'
    ) THEN
      ALTER TABLE xase_access_policies ADD COLUMN hipaa_category text;
    END IF;
  END IF;
END $$;

-- 6) Add regulatory_frameworks to access_offers (discovery/compliance surfacing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='access_offers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name='access_offers' AND column_name='regulatory_frameworks'
    ) THEN
      ALTER TABLE access_offers ADD COLUMN regulatory_frameworks text[] DEFAULT ARRAY[]::text[];
    END IF;
  END IF;
END $$;
