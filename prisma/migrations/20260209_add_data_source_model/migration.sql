-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "data_source_status" AS ENUM ('ACTIVE', 'SYNCING', 'ERROR', 'REMOVED');

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "data_source_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "cloud_integration_id" TEXT NOT NULL,
    "storage_location" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "num_recordings" INTEGER NOT NULL DEFAULT 0,
    "duration_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "language" TEXT,
    "sample_rate" INTEGER,
    "codec" TEXT,
    "status" "data_source_status" NOT NULL DEFAULT 'ACTIVE',
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_data_source_id_key" ON "data_sources"("data_source_id");

-- CreateIndex
CREATE INDEX "data_sources_dataset_id_idx" ON "data_sources"("dataset_id");

-- CreateIndex
CREATE INDEX "data_sources_cloud_integration_id_idx" ON "data_sources"("cloud_integration_id");

-- CreateIndex
CREATE INDEX "data_sources_status_idx" ON "data_sources"("status");

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "xase_voice_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_cloud_integration_id_fkey" FOREIGN KEY ("cloud_integration_id") REFERENCES "cloud_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Add data_source_id to AudioSegment (nullable initially for migration)
ALTER TABLE "xase_audio_segments" ADD COLUMN "data_source_id" TEXT;

-- CreateIndex
CREATE INDEX "xase_audio_segments_data_source_id_idx" ON "xase_audio_segments"("data_source_id");

-- Migrate existing datasets to DataSource (1:1 mapping)
-- For each dataset with cloudIntegrationId, create a corresponding DataSource
INSERT INTO "data_sources" (
    "id",
    "data_source_id",
    "dataset_id",
    "cloud_integration_id",
    "storage_location",
    "name",
    "description",
    "num_recordings",
    "duration_hours",
    "size_bytes",
    "language",
    "sample_rate",
    "codec",
    "status",
    "added_at"
)
SELECT
    gen_random_uuid(),
    'dsrc_' || substr(md5(random()::text), 1, 16),
    d.id,
    d.cloud_integration_id,
    d.storage_location,
    d.name || ' (Migrated Source)',
    d.description,
    d.num_recordings,
    d.total_duration_hours,
    COALESCE(d.storage_size, 0),
    d.language,
    d.sample_rate,
    d.codec,
    'ACTIVE'::"data_source_status",
    d.created_at
FROM "xase_voice_datasets" d
WHERE d.cloud_integration_id IS NOT NULL;

-- Link AudioSegments to their DataSources
UPDATE "xase_audio_segments" seg
SET "data_source_id" = src.id
FROM "data_sources" src
WHERE seg.dataset_id = src.dataset_id;

-- Make data_source_id NOT NULL after migration
-- (Only for segments that have a corresponding source)
-- Note: Segments without sources will need to be handled separately or deleted
ALTER TABLE "xase_audio_segments" 
ALTER COLUMN "data_source_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "xase_audio_segments" ADD CONSTRAINT "xase_audio_segments_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
