-- Add metadata column to xase_datasets table
ALTER TABLE xase_datasets ADD COLUMN IF NOT EXISTS metadata JSONB;
