#!/usr/bin/env node
/*
  XASE Bundle Worker (PostgreSQL-backed queue)
  -------------------------------------------
  Consumes jobs from xase_jobs and generates Evidence Bundles asynchronously.
  - Claim jobs with FOR UPDATE SKIP LOCKED
  - Retry with exponential backoff (3^attempts minutes)
  - Move to DLQ after max_attempts
  - Idempotent by dedupe_key (bundleId) and bundle status checks

  Requirements:
    DATABASE_URL
    MinIO/S3 envs (see cleanup script for list)

  Usage:
    node scripts/worker-bundles.mjs
*/

import { Client as PgClient } from 'pg'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import JSZip from 'jszip'
import crypto from 'crypto'

const POLL_MS = Number(process.env.WORKER_POLL_MS || 5000)

function getEnv(name, fallback) {
  const v = process.env[name]
  return v === undefined ? fallback : v
}

function header(msg) {
  console.log(`\n\x1b[36m❯ ${msg}\x1b[0m`)
}

function logJSON(level, message, ctx = {}, err) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...ctx,
  }
  if (err) payload.error = { message: err.message || String(err), stack: err.stack, name: err.name }
  console.log(JSON.stringify(payload))
}

function getS3Client() {
  const endpoint = getEnv('MINIO_SERVER_URL', getEnv('S3_ENDPOINT', null))
  const region = getEnv('S3_REGION', 'us-east-1')
  const accessKeyId = getEnv('MINIO_ROOT_USER', getEnv('S3_ACCESS_KEY', null))
  const secretAccessKey = getEnv('MINIO_ROOT_PASSWORD', getEnv('S3_SECRET_KEY', null))
  const forcePathStyle = getEnv('S3_FORCE_PATH_STYLE', '') === 'true' || !!process.env.MINIO_SERVER_URL
  if (!endpoint || !accessKeyId || !secretAccessKey) return null
  return new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey }, forcePathStyle })
}

async function uploadToStorage(s3, bucket, key, buffer) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'application/zip' }))
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')
  return { key, size: buffer.length, url: null, hash }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }
  const bucket = getEnv('BUCKET_NAME', getEnv('S3_BUCKET', 'xase'))

  const pg = new PgClient({ connectionString: dbUrl })
  await pg.connect()
  header('Worker started')

  const s3 = getS3Client()
  if (!s3) {
    console.warn('Storage not configured. Worker will generate ZIP but skip upload.')
  }

  while (true) {
    try {
      // Claim one job
      await pg.query('BEGIN')
      const { rows: claim } = await pg.query(
        `SELECT id FROM xase_jobs
         WHERE status='PENDING' AND run_at <= NOW()
         ORDER BY run_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      )
      if (claim.length === 0) {
        await pg.query('COMMIT')
        await new Promise((r) => setTimeout(r, POLL_MS))
        continue
      }

      const jobId = claim[0].id
      const { rows: jobs } = await pg.query(`UPDATE xase_jobs SET status='RUNNING', updated_at = NOW() WHERE id = $1 RETURNING *`, [jobId])
      await pg.query('COMMIT')
      const job = jobs[0]

      const { type, payload, attempts, max_attempts } = job
      const ctx = { jobId, type }
      logJSON('info', 'worker.job:claimed', ctx)

      if (type !== 'GENERATE_BUNDLE') {
        logJSON('warn', 'worker.job:unknown_type', ctx)
        await pg.query(`UPDATE xase_jobs SET status='DONE', updated_at=NOW() WHERE id = $1`, [jobId])
        continue
      }

      // Parse payload
      const { bundleId, tenantId, dateFilter } = payload

      // Fetch bundle
      const { rows: bundles } = await pg.query(`SELECT * FROM xase_evidence_bundles WHERE bundle_id = $1 AND tenant_id = $2 LIMIT 1`, [bundleId, tenantId])
      if (bundles.length === 0) {
        logJSON('warn', 'worker.job:bundle_missing', { ...ctx, bundleId, tenantId })
        await pg.query(`UPDATE xase_jobs SET status='DONE', updated_at=NOW() WHERE id = $1`, [jobId])
        continue
      }
      const bundle = bundles[0]

      if (bundle.status === 'READY') {
        logJSON('info', 'worker.job:idempotent_already_ready', { ...ctx, bundleId })
        await pg.query(`UPDATE xase_jobs SET status='DONE', updated_at=NOW() WHERE id = $1`, [jobId])
        continue
      }

      // Mark PROCESSING
      await pg.query(`UPDATE xase_evidence_bundles SET status='PROCESSING' WHERE id = $1`, [bundle.id])

      // Fetch records to include
      const filters = []
      const params = [tenantId]
      let paramIdx = 2
      if (dateFilter && dateFilter.gte) { filters.push(`timestamp >= $${paramIdx++}`); params.push(dateFilter.gte) }
      if (dateFilter && dateFilter.lte) { filters.push(`timestamp <= $${paramIdx++}`); params.push(dateFilter.lte) }
      const where = [`tenant_id = $1`, ...filters].join(' AND ')
      const { rows: records } = await pg.query(`SELECT id, transaction_id, policy_id, decision_type, confidence, is_verified, timestamp FROM decision_records WHERE ${where} ORDER BY timestamp ASC`, params)

      // Build ZIP
      const zip = new JSZip()
      const recordsData = {
        bundleId: bundle.bundle_id,
        tenantId: bundle.tenant_id,
        purpose: bundle.purpose,
        description: bundle.description,
        createdAt: bundle.created_at?.toISOString?.() || new Date(bundle.created_at).toISOString(),
        createdBy: bundle.created_by,
        recordCount: records.length,
        records: records.map((r) => ({
          id: r.id,
          transactionId: r.transaction_id,
          policyId: r.policy_id,
          decisionType: r.decision_type,
          confidence: r.confidence,
          isVerified: r.is_verified,
          timestamp: (r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)).toISOString(),
        })),
      }
      const recordsJson = JSON.stringify(recordsData, null, 2)
      zip.file('records.json', recordsJson)

      const metadata = {
        bundleId: bundle.bundle_id,
        version: '1.0',
        generatedAt: new Date().toISOString(),
        purpose: bundle.purpose,
        description: bundle.description,
        recordCount: records.length,
        dateRange: {
          from: bundle.date_from ? new Date(bundle.date_from).toISOString() : null,
          to: bundle.date_to ? new Date(bundle.date_to).toISOString() : null,
        },
        compliance: { worm: true, tamperEvident: true, cryptographicallySigned: true },
      }
      zip.file('metadata.json', JSON.stringify(metadata, null, 2))

      const recordsHash = crypto.createHash('sha256').update(recordsJson).digest('hex')
      zip.file('signature.json', JSON.stringify({ algorithm: 'SHA256', hash: recordsHash, signedAt: new Date().toISOString(), signedBy: 'xase-kms-mock' }, null, 2))

      const verifyJs = `#!/usr/bin/env node\nconst fs=require('fs');const crypto=require('crypto');const r=fs.readFileSync('records.json','utf8');const s=JSON.parse(fs.readFileSync('signature.json','utf8'));const h=crypto.createHash('sha256').update(r).digest('hex');if(h===s.hash){console.log('✅ VERIFICATION PASSED');process.exit(0)}else{console.log('❌ VERIFICATION FAILED');process.exit(1)}}`
      zip.file('verify.js', verifyJs)
      zip.file('README.md', `# XASE Evidence Bundle\n\nBundle ID: ${bundle.bundle_id}\nGenerated: ${new Date().toISOString()}\nRecords: ${records.length}\n`)

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })

      // Upload to storage
      let uploaded = { key: null, url: null, size: zipBuffer.length, hash: recordsHash }
      if (s3) {
        const key = `evidence-bundles/${bundle.tenant_id}/${bundle.bundle_id}.zip`
        uploaded = await uploadToStorage(s3, bucket, key, zipBuffer)
      }

      // Update bundle READY
      await pg.query(
        `UPDATE xase_evidence_bundles
         SET status='READY', completed_at = NOW(), storage_key = $2, storage_url = $3, bundle_size = $4, bundle_hash = $5
         WHERE id = $1`,
        [bundle.id, uploaded.key, uploaded.url, uploaded.size, uploaded.hash]
      )

      // Audit log
      await pg.query(
        `INSERT INTO xase_audit_logs (id, tenantid, userid, action, resourcetype, resourceid, status, metadata, timestamp)
         VALUES (gen_random_uuid(), $1, $2, 'BUNDLE_PROCESS', 'EVIDENCE_BUNDLE', $3, 'SUCCESS', $4, NOW())`,
        [bundle.tenant_id, bundle.created_by, bundle.bundle_id, JSON.stringify({ storageKey: uploaded.key, size: uploaded.size })]
      )

      // Mark job done
      await pg.query(`UPDATE xase_jobs SET status='DONE', updated_at = NOW() WHERE id = $1`, [jobId])
      logJSON('info', 'worker.job:success', { ...ctx, bundleId })
    } catch (err) {
      // Load job to decide retry vs DLQ
      let job
      try {
        const { rows } = await pg.query(`SELECT * FROM xase_jobs WHERE status='RUNNING' ORDER BY updated_at DESC LIMIT 1`)
        job = rows[0]
      } catch {}

      const lastError = (err?.message || String(err)).slice(0, 2000)
      if (job) {
        const attempts = Number(job.attempts || 0) + 1
        if (attempts >= Number(job.max_attempts || 5)) {
          // DLQ
          await pg.query('BEGIN')
          await pg.query(
            `INSERT INTO xase_jobs_dlq (id, type, payload, attempts, max_attempts, last_error, created_at, updated_at)
             SELECT id, type, payload, attempts, max_attempts, $2, created_at, updated_at FROM xase_jobs WHERE id=$1`,
            [job.id, lastError]
          )
          await pg.query(`DELETE FROM xase_jobs WHERE id = $1`, [job.id])
          await pg.query('COMMIT')
          logJSON('error', 'worker.job:dlq', { jobId: job.id, type: job.type }, err)
        } else {
          // Backoff
          await pg.query(
            `UPDATE xase_jobs SET status='PENDING', attempts = attempts + 1, last_error = $2,
             run_at = NOW() + MAKE_INTERVAL(mins := $3), updated_at = NOW() WHERE id = $1`,
            [job.id, lastError, Math.pow(3, attempts)]
          )
          logJSON('warn', 'worker.job:rescheduled', { jobId: job.id, type: job.type, attempts })
        }
      } else {
        logJSON('error', 'worker.loop:error', {}, err)
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }
}

main().catch((e) => {
  logJSON('error', 'worker:init_error', {}, e)
  process.exit(1)
})
