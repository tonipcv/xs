-- Migration: Add metadata column to xase_datasets table
-- Created: 2026-03-07
-- Purpose: Support dataset versioning and extensible metadata

-- Add metadata column (nullable JSON for version storage)
ALTER TABLE xase_datasets 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index for efficient metadata queries
CREATE INDEX IF NOT EXISTS idx_dataset_metadata 
ON xase_datasets USING GIN (metadata jsonb_path_ops);

-- Add comment explaining the field
COMMENT ON COLUMN xase_datasets.metadata IS 'Extensible JSON metadata for version tracking and custom properties';
