-- Add data_type column to xase_datasets using existing enum type data_type (idempotent)
-- Safe to run multiple times

DO $$
BEGIN
  -- Ensure enum type exists with all expected values
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'data_type'
  ) THEN
    CREATE TYPE data_type AS ENUM ('AUDIO', 'IMAGE', 'TEXT', 'TIMESERIES', 'TABULAR');
  ELSE
    -- Add missing values defensively
    ALTER TYPE data_type ADD VALUE IF NOT EXISTS 'AUDIO';
    ALTER TYPE data_type ADD VALUE IF NOT EXISTS 'IMAGE';
    ALTER TYPE data_type ADD VALUE IF NOT EXISTS 'TEXT';
    ALTER TYPE data_type ADD VALUE IF NOT EXISTS 'TIMESERIES';
    ALTER TYPE data_type ADD VALUE IF NOT EXISTS 'TABULAR';
  END IF;

  -- Add column to xase_datasets if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'xase_datasets' AND column_name = 'data_type'
  ) THEN
    ALTER TABLE public.xase_datasets ADD COLUMN data_type data_type NULL;
  END IF;

  -- Create index if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'xase_datasets_data_type_idx'
  ) THEN
    CREATE INDEX xase_datasets_data_type_idx ON public.xase_datasets (data_type);
  END IF;
END
$$;
