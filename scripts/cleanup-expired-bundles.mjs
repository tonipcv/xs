#!/usr/bin/env node
/*
  Cleanup Expired Evidence Bundles
  --------------------------------
  Deletes expired bundles from MinIO/S3 and marks records as cleaned up.
  Enforcement:
    - Skip bundles with legalHold = true
    - Skip bundles with retentionUntil in the future
    - Only delete when expires_at < now AND (no legalHold) AND (no active retentionUntil)

  Requirements:
    - DATABASE_URL (PostgreSQL)
    - MINIO/S3 envs (same as app):
      MINIO_SERVER_URL | S3_ENDPOINT
      MINIO_ROOT_USER | S3_ACCESS_KEY
      MINIO_ROOT_PASSWORD | S3_SECRET_KEY
      BUCKET_NAME | S3_BUCKET
      S3_FORCE_PATH_STYLE=true (for MinIO)
      S3_REGION

  Usage:
    node scripts/cleanup-expired-bundles.mjs [--dry-run]
*/

import { Client as PgClient } from 'pg';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');

function getEnv(name, fallback) {
  const v = process.env[name];
  return v === undefined ? fallback : v;
}

function header(msg) {
  console.log(`\n\x1b[36m❯ ${msg}\x1b[0m`);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('\n\x1b[31m✖ DATABASE_URL not set\x1b[0m');
    process.exit(1);
  }

  const endpoint = getEnv('MINIO_SERVER_URL', getEnv('S3_ENDPOINT', null));
  const region = getEnv('S3_REGION', 'us-east-1');
  const accessKeyId = getEnv('MINIO_ROOT_USER', getEnv('S3_ACCESS_KEY', null));
  const secretAccessKey = getEnv('MINIO_ROOT_PASSWORD', getEnv('S3_SECRET_KEY', null));
  const bucket = getEnv('BUCKET_NAME', getEnv('S3_BUCKET', 'xase'));
  const forcePathStyle = getEnv('S3_FORCE_PATH_STYLE', '') === 'true' || !!process.env.MINIO_SERVER_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error('\n\x1b[31m✖ Storage not configured. Set MINIO/S3 environment variables.\x1b[0m');
    process.exit(1);
  }

  header('Connecting to database');
  const pg = new PgClient({ connectionString: dbUrl });
  await pg.connect();

  header('Querying expired bundles');
  const { rows } = await pg.query(`
    SELECT id, bundle_id, tenant_id, storage_key, storage_url, legal_hold, retention_until, expires_at
    FROM xase_evidence_bundles
    WHERE status = 'READY'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
      AND (legal_hold = false OR legal_hold IS NULL)
      AND (retention_until IS NULL OR retention_until < NOW())
    ORDER BY expires_at ASC
    LIMIT 500;
  `);

  if (rows.length === 0) {
    console.log('No expired bundles to clean up.');
    await pg.end();
    return;
  }

  console.log(`Found ${rows.length} expired bundles.`);

  header('Initializing S3 client');
  const s3 = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle,
  });

  let deleted = 0; let failed = 0;

  for (const row of rows) {
    const key = row.storage_key;
    if (!key) {
      console.warn(`Skipping bundle ${row.bundle_id}: no storage_key`);
      continue;
    }

    try {
      if (DRY_RUN) {
        console.log(`[dry-run] Would delete ${bucket}/${key}`);
      } else {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        console.log(`Deleted ${bucket}/${key}`);
      }

      if (!DRY_RUN) {
        // Mark bundle as expired/cleaned (optional: add a new column if needed). For now just null storage fields.
        await pg.query(
          `UPDATE xase_evidence_bundles
             SET storage_key = NULL, storage_url = NULL, bundle_size = NULL, bundle_hash = NULL
           WHERE id = $1`,
          [row.id]
        );

        // Log audit entry
        await pg.query(
          `INSERT INTO xase_audit_logs (id, tenantid, userid, action, resourceType, resourceId, status, metadata, timestamp)
           VALUES (gen_random_uuid(), $1, NULL, 'BUNDLE_CLEANUP', 'EVIDENCE_BUNDLE', $2, 'SUCCESS', $3, NOW())`,
          [row.tenant_id, row.bundle_id, JSON.stringify({ storageKey: key })]
        );
      }

      deleted++;
    } catch (err) {
      console.error(`Failed to delete ${bucket}/${key}:`, err?.message || err);
      failed++;

      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO xase_audit_logs (id, tenantid, userid, action, resourceType, resourceId, status, errorMessage, metadata, timestamp)
           VALUES (gen_random_uuid(), $1, NULL, 'BUNDLE_CLEANUP', 'EVIDENCE_BUNDLE', $2, 'FAILED', $3, $4, NOW())`,
          [row.tenant_id, row.bundle_id, String(err?.message || err), JSON.stringify({ storageKey: key })]
        );
      }
    }
  }

  console.log(`Cleanup completed. Deleted=${deleted}, Failed=${failed}${DRY_RUN ? ' (dry-run)' : ''}`);
  await pg.end();
}

main().catch((e) => {
  console.error('\n\x1b[31m✖ Cleanup failed:\x1b[0m', e?.message || e);
  process.exit(1);
});
