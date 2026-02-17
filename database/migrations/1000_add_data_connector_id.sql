-- Add data_connector_id column to xase_voice_datasets
-- Idempotent, safe to run multiple times

BEGIN;

-- Add column if not exists
ALTER TABLE IF EXISTS xase_voice_datasets
  ADD COLUMN IF NOT EXISTS data_connector_id text;

-- Add FK to data_connectors if table exists and FK not present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'data_connectors'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   information_schema.table_constraints tc
      JOIN   information_schema.key_column_usage kcu
      ON     tc.constraint_name = kcu.constraint_name
      WHERE  tc.table_schema = 'public'
      AND    tc.table_name = 'xase_voice_datasets'
      AND    tc.constraint_type = 'FOREIGN KEY'
      AND    kcu.column_name = 'data_connector_id'
    ) THEN
      ALTER TABLE xase_voice_datasets
        ADD CONSTRAINT xase_voice_datasets_data_connector_id_fkey
        FOREIGN KEY (data_connector_id)
        REFERENCES data_connectors(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

-- Add index if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename = 'xase_voice_datasets'
    AND indexname = 'xase_voice_datasets_data_connector_id_idx'
  ) THEN
    CREATE INDEX xase_voice_datasets_data_connector_id_idx 
    ON xase_voice_datasets(data_connector_id);
  END IF;
END$$;

COMMIT;
