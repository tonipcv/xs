/*
 Idempotent migration: ensure xase_voice_datasets.storage_location exists and is NOT NULL
 Policy: Manual SQL via Node (pg), no Prisma migrate.
*/

const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1) Create legacy columns if missing
    await client.query(`
      ALTER TABLE IF EXISTS xase_voice_datasets
      ADD COLUMN IF NOT EXISTS storage_location text;
    `);

    await client.query(`
      ALTER TABLE IF EXISTS xase_voice_datasets
      ADD COLUMN IF NOT EXISTS storage_size bigint;
    `);

    await client.query(`
      ALTER TABLE IF EXISTS xase_voice_datasets
      ADD COLUMN IF NOT EXISTS dataset_hash text;
    `);

    await client.query(`
      ALTER TABLE IF EXISTS xase_voice_datasets
      ADD COLUMN IF NOT EXISTS cloud_integration_id text;
    `);

    await client.query(`
      ALTER TABLE IF EXISTS xase_voice_datasets
      ADD COLUMN IF NOT EXISTS data_connector_id text;
    `);

    // 2) Backfill NULLs to empty string to satisfy NOT NULL constraint later
    await client.query(`
      UPDATE xase_voice_datasets
      SET storage_location = ''
      WHERE storage_location IS NULL;
    `);

    // 3) Enforce NOT NULL for storage_location if possible (will be a no-op if already set)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'xase_voice_datasets'
            AND column_name = 'storage_location'
            AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE xase_voice_datasets
          ALTER COLUMN storage_location SET NOT NULL;
        END IF;
      END$$;
    `);

    await client.query('COMMIT');
    console.log('Migration completed: storage_location ensured on xase_voice_datasets');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
