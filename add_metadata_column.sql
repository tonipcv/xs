-- Add metadata column to xase_datasets table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xase_datasets' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE xase_datasets ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;
