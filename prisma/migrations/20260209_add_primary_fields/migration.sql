-- Add new aggregate fields to Dataset table

-- Add primary* fields
ALTER TABLE "xase_voice_datasets" ADD COLUMN IF NOT EXISTS "primary_language" TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "xase_voice_datasets" ADD COLUMN IF NOT EXISTS "primary_sample_rate" INTEGER NOT NULL DEFAULT 16000;
ALTER TABLE "xase_voice_datasets" ADD COLUMN IF NOT EXISTS "primary_codec" TEXT NOT NULL DEFAULT 'wav';
ALTER TABLE "xase_voice_datasets" ADD COLUMN IF NOT EXISTS "primary_channel_count" INTEGER NOT NULL DEFAULT 1;

-- Add totalSizeBytes field
ALTER TABLE "xase_voice_datasets" ADD COLUMN IF NOT EXISTS "total_size_bytes" BIGINT NOT NULL DEFAULT 0;

-- Add avgNoiseLevel field
ALTER TABLE "xase_voice_datasets" ADD COLUMN IF NOT EXISTS "avg_noise_level" TEXT;

-- Create index on primary_language
CREATE INDEX IF NOT EXISTS "xase_voice_datasets_primary_language_idx" ON "xase_voice_datasets"("primary_language");

-- Backfill primary_language from language
UPDATE "xase_voice_datasets" SET "primary_language" = "language" WHERE "primary_language" = 'en-US';

-- Backfill totalSizeBytes from storageSize where available
UPDATE "xase_voice_datasets" SET "total_size_bytes" = "storage_size" WHERE "storage_size" IS NOT NULL AND "total_size_bytes" = 0;
