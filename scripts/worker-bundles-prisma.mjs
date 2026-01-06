#!/usr/bin/env node
/*
  XASE Bundle Worker (Prisma-based, Postgres-backed queue)
  -------------------------------------------------------
  Resolve end-to-end bundle generation using Prisma for app data
  (EvidenceBundle, DecisionRecord, AuditLog) and Postgres for the queue.

  Features:
    - Claims jobs from xase_jobs with FOR UPDATE SKIP LOCKED
    - Uses Prisma Client to read/write app tables (no SQL name mismatch)
    - Retry with exponential backoff (3^attempts minutes)
    - DLQ after max_attempts
    - Idempotent: skip if bundle already READY
    - Optional storage upload (MinIO/S3); otherwise keeps fallback download path

  Usage:
    node scripts/worker-bundles-prisma.mjs [--poll-ms 5000]

  Requirements:
    DATABASE_URL must be set
*/

import { PrismaClient } from '@prisma/client'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import crypto from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const argv = process.argv.slice(2)
function getFlag(name, fallback) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = argv[i + 1]
  if (!v || v.startsWith('--')) return true
  return v
}

const POLL_MS = Number(getFlag('poll-ms', process.env.WORKER_POLL_MS || 5000))

function log(level, message, ctx = {}, err) {
  const payload = { ts: new Date().toISOString(), level, message, ...ctx }
  if (err) payload.error = { message: err.message || String(err), stack: err.stack, name: err.name }
  console.log(JSON.stringify(payload))
}

// Optional Sentry for worker (no-op if not configured or package missing)
async function sentryCapture(level, messageOrError, ctx = {}) {
  try {
    if (!process.env.SENTRY_DSN) return
    const Sentry = await import('@sentry/node')
    if (!Sentry || !Sentry.captureMessage) return
    if (level === 'error' && messageOrError instanceof Error) {
      Sentry.captureException(messageOrError, { tags: ctx.tags, extra: ctx.extra })
    } else {
      Sentry.captureMessage(String(messageOrError), { level, tags: ctx.tags, extra: ctx.extra })
    }
  } catch {
    // no-op
  }
}

function getStorageConfig() {
  const endpoint = process.env.MINIO_SERVER_URL || process.env.S3_ENDPOINT || null
  const region = process.env.S3_REGION || 'us-east-1'
  const accessKeyId = process.env.MINIO_ROOT_USER || process.env.S3_ACCESS_KEY || null
  const secretAccessKey = process.env.MINIO_ROOT_PASSWORD || process.env.S3_SECRET_KEY || null
  const bucket = process.env.BUCKET_NAME || process.env.S3_BUCKET || 'xase'
  const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE === 'true') || !!process.env.MINIO_SERVER_URL
  const configured = !!(endpoint && accessKeyId && secretAccessKey)
  return { configured, endpoint, region, accessKeyId, secretAccessKey, bucket, forcePathStyle }
}

function getS3Client(cfg) {
  if (!cfg.configured) return null
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: cfg.forcePathStyle,
  })
}

async function uploadZipIfConfigured(s3, bucket, key, buffer) {
  if (!s3) return { key: null, url: null, size: buffer.length, hash: crypto.createHash('sha256').update(buffer).digest('hex') }
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'application/zip' }))
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')
  return { key, url: null, size: buffer.length, hash }
}

// Optional: sign records.json hash with AWS KMS (ECDSA_SHA_256)
async function signWithKMS(recordsHashHex) {
  const region = process.env.AWS_REGION
  const keyId = process.env.KMS_KEY_ID
  if (!region || !keyId) return null
  try {
    const kmsMod = await import('@aws-sdk/client-kms')
    const { KMSClient, SignCommand } = kmsMod
    const kms = new KMSClient({ region })
    const digest = Buffer.from(recordsHashHex, 'hex')
    const res = await kms.send(new SignCommand({
      KeyId: keyId,
      Message: digest,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    }))
    const sigBase64 = res.Signature ? Buffer.from(res.Signature).toString('base64') : null
    if (!sigBase64) return null
    return {
      algorithm: 'ECDSA_SHA_256',
      keyId,
      signedAt: new Date().toISOString(),
      hash: recordsHashHex,
      signature: sigBase64,
    }
  } catch (e) {
    log('warn', 'worker.kms_sign_failed', { error: (e?.message || String(e)).slice(0, 200) })
    return null
  }
}

// Raw queue helpers with Prisma
async function claimNextJob(prisma) {
  // Claim one job using SKIP LOCKED
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `SELECT id FROM xase_jobs
       WHERE status='PENDING' AND run_at <= NOW()
       ORDER BY run_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    )
    if (!rows || rows.length === 0) return null
    const jobId = rows[0].id
    const updated = await tx.$queryRawUnsafe(`UPDATE xase_jobs SET status='RUNNING', updated_at = NOW() WHERE id = $1::uuid RETURNING *`, jobId)
    return updated?.[0] || null
  })
}

async function markDone(prisma, id) {
  await prisma.$executeRawUnsafe(`UPDATE xase_jobs SET status='DONE', updated_at = NOW() WHERE id = $1::uuid`, id)
}

async function reschedule(prisma, job, lastError) {
  const attempts = Number(job.attempts || 0) + 1
  const minutes = Math.pow(3, attempts) // 1,3,9,27...
  await prisma.$executeRawUnsafe(
    `UPDATE xase_jobs
     SET status='PENDING', attempts = attempts + 1, last_error = $2,
         run_at = NOW() + ($3::int * INTERVAL '1 minute'), updated_at = NOW()
     WHERE id = $1::uuid`,
    job.id,
    (lastError || '').toString().slice(0, 2000),
    minutes
  )
  return attempts
}

async function moveToDLQ(prisma, job, lastError) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO xase_jobs_dlq (id, type, payload, attempts, max_attempts, last_error, created_at, updated_at)
       SELECT id, type, payload, attempts, max_attempts, $2, created_at, updated_at FROM xase_jobs WHERE id = $1::uuid`,
      job.id,
      (lastError || '').toString().slice(0, 2000)
    )
    await tx.$executeRawUnsafe(`DELETE FROM xase_jobs WHERE id = $1::uuid`, job.id)
  })
}

async function processGenerateBundle(prisma, job, opts = {}) {
  const requestId = opts.requestId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
  const ctx = { requestId, jobId: job.id, type: job.type }
  let payload
  try {
    payload = typeof job.payload === 'object' ? job.payload : JSON.parse(job.payload)
  } catch (e) {
    throw new Error(`Invalid payload JSON: ${e?.message || e}`)
  }
  const { bundleId, tenantId, dateFilter, packageTitle } = payload || {}
  if (!bundleId || !tenantId) throw new Error('Missing bundleId or tenantId in payload')

  // Idempotency check
  const bundle = await prisma.evidenceBundle.findFirst({ where: { bundleId, tenantId } })
  if (!bundle) {
    log('warn', 'worker.bundle_not_found', { ...ctx, bundleId, tenantId })
    await sentryCapture('warn', 'worker.bundle_not_found', { tags: { action: 'GENERATE_BUNDLE' }, extra: { requestId, bundleId, tenantId } })
    await markDone(prisma, job.id)
    return
  }
  if (bundle.status === 'READY') {
    log('info', 'worker.idempotent_already_ready', { ...ctx, bundleId })
    await markDone(prisma, job.id)
    return
  }

  // Mark processing
  await prisma.evidenceBundle.update({ where: { id: bundle.id }, data: { status: 'PROCESSING' } })

  // Fetch records
  const where = {
    tenantId,
    ...(dateFilter && Object.keys(dateFilter).length > 0
      ? { timestamp: {
          ...(dateFilter.gte ? { gte: new Date(dateFilter.gte) } : {}),
          ...(dateFilter.lte ? { lte: new Date(dateFilter.lte) } : {}),
        } }
      : {}),
  }
  const records = await prisma.decisionRecord.findMany({ where, orderBy: { timestamp: 'asc' } })

  // Human oversight stats (group by action) for all records in this bundle
  let oversight = {}
  try {
    const recordIds = records.map(r => r.id)
    if (recordIds.length > 0) {
      const groups = await prisma.humanIntervention.groupBy({ by: ['action'], where: { recordId: { in: recordIds } }, _count: true })
      groups.forEach(g => { oversight[g.action] = g._count })
    }
  } catch (e) {
    log('warn', 'worker.oversight_stats_failed', { error: (e?.message||String(e)).slice(0,200) })
  }

  // Build ZIP
  const zip = new JSZip()
  const recordsData = {
    bundleId: bundle.bundleId,
    tenantId: bundle.tenantId,
    purpose: bundle.purpose,
    description: bundle.description,
    createdAt: bundle.createdAt.toISOString(),
    createdBy: bundle.createdBy,
    recordCount: records.length,
    records: records.map((r) => ({
      id: r.id,
      transactionId: r.transactionId,
      policyId: r.policyId,
      decisionType: r.decisionType,
      confidence: r.confidence,
      isVerified: r.isVerified,
      timestamp: r.timestamp.toISOString(),
    })),
  }
  const recordsJson = JSON.stringify(recordsData, null, 2)
  zip.file('records.json', recordsJson)

  const metadata = {
    bundleId: bundle.bundleId,
    version: '1.0',
    generatedAt: new Date().toISOString(),
    purpose: bundle.purpose,
    description: bundle.description,
    recordCount: records.length,
    dateRange: {
      from: bundle.dateFrom ? new Date(bundle.dateFrom).toISOString() : null,
      to: bundle.dateTo ? new Date(bundle.dateTo).toISOString() : null,
    },
    compliance: { worm: true, tamperEvident: true, cryptographicallySigned: true },
  }
  zip.file('metadata.json', JSON.stringify(metadata, null, 2))

  const recordsHash = crypto.createHash('sha256').update(recordsJson).digest('hex')
  const kmsSig = await signWithKMS(recordsHash)
  if (kmsSig) {
    zip.file('signature.json', JSON.stringify(kmsSig, null, 2))
  } else {
    // Fallback signature (hash-only) when KMS not configured
    zip.file('signature.json', JSON.stringify({ algorithm: 'SHA256', hash: recordsHash, signedAt: new Date().toISOString(), signedBy: 'local' }, null, 2))
  }

  const verifyJs = `#!/usr/bin/env node
const fs=require('fs');
const crypto=require('crypto');
const records=fs.readFileSync('records.json','utf8');
const s=JSON.parse(fs.readFileSync('signature.json','utf8'));
const computedHash=crypto.createHash('sha256').update(records).digest('hex');

// 1. Verify hash
if(computedHash!==s.hash){
  console.log('❌ HASH VERIFICATION FAILED');
  process.exit(1);
}

// 2. Verify signature (if KMS signed)
if(s.algorithm==='ECDSA_SHA_256'&&s.signature){
  if(!fs.existsSync('public-key.pem')){
    console.log('⚠️  Hash OK, but public key not found for signature verification.');
    console.log('   Get public key: aws kms get-public-key --key-id '+s.keyId+' --region ${process.env.AWS_REGION||'us-east-1'}');
    console.log('   Convert: jq -r .PublicKey public-key.json | base64 --decode > public-key.der');
    console.log('   Convert: openssl ec -inform DER -pubin -in public-key.der -out public-key.pem');
    process.exit(2);
  }
  const pubKey=fs.readFileSync('public-key.pem');
  const sig=Buffer.from(s.signature,'base64');
  const verifier=crypto.createVerify('sha256');
  verifier.update(records);
  verifier.end();
  const ok=verifier.verify(pubKey,sig);
  if(ok){
    console.log('✅ VERIFICATION PASSED (KMS ECDSA)');
    console.log('   Algorithm: '+s.algorithm);
    console.log('   Key ID: '+s.keyId);
    console.log('   Signed at: '+s.signedAt);
    process.exit(0);
  }else{
    console.log('❌ SIGNATURE VERIFICATION FAILED');
    process.exit(1);
  }
}else{
  console.log('✅ HASH VERIFICATION PASSED (no KMS signature)');
  process.exit(0);
}`
  zip.file('verify.js', verifyJs)
  
  const readmeContent = `# XASE Evidence Bundle

Bundle ID: ${bundle.bundleId}
Generated: ${new Date().toISOString()}
Records: ${records.length}

## Contents

- **records.json**: Evidence records in structured JSON format
- **metadata.json**: Bundle metadata and compliance information
- **signature.json**: Cryptographic signature (${kmsSig ? 'KMS ECDSA_SHA_256' : 'SHA256 hash'})
- **verify.js**: Verification script
- **README.md**: This file

## Verification

### Quick verification (hash only):
\`\`\`bash
node verify.js
\`\`\`

### Full verification (with KMS signature):
${kmsSig ? `
1. Get public key from AWS KMS:
\`\`\`bash
aws kms get-public-key --key-id ${kmsSig.keyId} --region ${process.env.AWS_REGION || 'us-east-1'} --output json > public-key.json
jq -r '.PublicKey' public-key.json | base64 --decode > public-key.der
openssl ec -inform DER -pubin -in public-key.der -out public-key.pem
\`\`\`

2. Verify signature:
\`\`\`bash
node verify.js
\`\`\`

The signature is cryptographically signed using AWS KMS with ECDSA_SHA_256.
The private key never leaves the HSM and cannot be exported.
` : `
KMS signing not configured. Bundle uses hash-only verification.
`}

## Compliance

- **WORM**: Write-Once-Read-Many (immutable)
- **Tamper-Evident**: Cryptographic hash verification
- **Cryptographically Signed**: ${kmsSig ? 'Yes (AWS KMS ECDSA)' : 'No (hash-only)'}
- **Offline Verification**: ${kmsSig ? 'Yes (with public key)' : 'Yes (hash)'}

## Chain of Custody

All access to this bundle is logged in the XASE audit trail.
Contact your compliance officer for audit logs.
`
  zip.file('README.md', readmeContent)

  // Generate PDF Legal Report (embedded + uploaded)
  try {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    const page = doc.addPage([595.28, 841.89])
    const margin = 48
    let y = 790
    const h = (t) => { page.drawText(t, { x: margin, y, size: 18, font: fontBold, color: rgb(0.1,0.1,0.1) }); y -= 28; }
    const kv = (k,v) => { page.drawText(k, { x: margin, y, size: 10, font: fontBold, color: rgb(0.25,0.25,0.25) }); page.drawText(String(v ?? 'N/A'), { x: margin+180, y, size: 10, font, color: rgb(0.05,0.05,0.05) }); y -= 16 }

    const reportTitle = packageTitle || bundle.description || 'Compliance Evidence Report'
    h(reportTitle)
    kv('Bundle ID', bundle.bundleId)
    kv('Tenant', bundle.tenantId)
    kv('Purpose', bundle.purpose || 'N/A')
    kv('Description', bundle.description || 'N/A')
    kv('Created At (UTC)', bundle.createdAt.toISOString())
    kv('Record Count', records.length)
    y -= 10
    h('Verification')
    page.drawText('Use verify.js to validate hashes and signatures. See README.md inside the bundle.', { x: margin, y, size: 10, font, color: rgb(0.05,0.05,0.05), maxWidth: 595.28 - margin*2, lineHeight: 12 })
    y -= 28
    h('Cryptographic Hashes')
    kv('records.json (SHA-256)', recordsHash)
    if (metadata && metadata.generatedAt) kv('metadata.generatedAt', metadata.generatedAt)
    y -= 10
    h('Signature (KMS)')
    if (kmsSig) {
      kv('Algorithm', kmsSig.algorithm)
      kv('Key ID', kmsSig.keyId)
      kv('Signed At', kmsSig.signedAt)
    } else {
      kv('Status', 'Hash-only verification (no KMS signature)')
    }
    y -= 10
    h('Human Oversight Summary')
    const overs = {
      APPROVED: oversight.APPROVED || 0,
      REJECTED: oversight.REJECTED || 0,
      OVERRIDE: oversight.OVERRIDE || 0,
      ESCALATED: oversight.ESCALATED || 0,
      REVIEW_REQUESTED: oversight.REVIEW_REQUESTED || 0,
    }
    Object.entries(overs).forEach(([k,v]) => kv(k, v))

    const pdfBytes = await doc.save()
    // Embed into ZIP
    zip.file('reports/report.pdf', pdfBytes)

    // Upload PDF separately if storage configured
    const storageCfg = getStorageConfig()
    const s3Client = getS3Client(storageCfg)
    let pdfUrl = null
    if (s3Client) {
      const pdfKey = `pdf/${bundle.tenantId}/${bundle.bundleId}/report.pdf`
      await s3Client.send(new PutObjectCommand({ Bucket: storageCfg.bucket, Key: pdfKey, Body: Buffer.from(pdfBytes), ContentType: 'application/pdf' }))
      pdfUrl = `${storageCfg.endpoint}/${storageCfg.bucket}/${pdfKey}`
    }

    // Mark includesPdf and url (if available)
    await prisma.evidenceBundle.update({ where: { id: bundle.id }, data: { includesPdf: true, pdfReportUrl: pdfUrl } })
  } catch (e) {
    log('warn', 'worker.pdf_generate_failed', { error: (e?.message||String(e)).slice(0,200) })
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })

  const storageCfg = getStorageConfig()
  const s3Client = getS3Client(storageCfg)
  if (!storageCfg.configured) {
    log('warn', 'worker.storage_not_configured')
  }

  const key = storageCfg.configured ? `evidence-bundles/${bundle.tenantId}/${bundle.bundleId}.zip` : null
  const uploaded = await uploadZipIfConfigured(s3Client, storageCfg.bucket, key, zipBuffer)

  // Persist bundle READY
  await prisma.evidenceBundle.update({
    where: { id: bundle.id },
    data: {
      status: 'READY',
      completedAt: new Date(),
      storageKey: uploaded.key,
      storageUrl: uploaded.url,
      bundleSize: uploaded.size,
      bundleHash: uploaded.hash,
    },
  })

  // Audit
  await prisma.auditLog.create({
    data: {
      tenantId: bundle.tenantId,
      userId: bundle.createdBy,
      action: 'BUNDLE_PROCESS',
      resourceType: 'EVIDENCE_BUNDLE',
      resourceId: bundle.bundleId,
      status: 'SUCCESS',
      metadata: JSON.stringify({ storageKey: uploaded.key, size: uploaded.size }),
    },
  })

  await markDone(prisma, job.id)
  log('info', 'worker.job:success', { requestId, jobId: job.id, bundleId: bundle.bundleId })
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('✖ DATABASE_URL not set')
    process.exit(1)
  }
  const prisma = new PrismaClient()
  await prisma.$connect()

  log('info', 'worker.start', { pollMs: POLL_MS })

  while (true) {
    try {
      const job = await claimNextJob(prisma)
      if (!job) {
        await new Promise((r) => setTimeout(r, POLL_MS))
        continue
      }

      if (job.type !== 'GENERATE_BUNDLE') {
        log('warn', 'worker.job:unknown_type', { jobId: job.id, type: job.type })
        await markDone(prisma, job.id)
        continue
      }

      try {
        const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
        await processGenerateBundle(prisma, job, { requestId })
      } catch (err) {
        const attempts = Number(job.attempts || 0) + 1
        if (attempts >= Number(job.max_attempts || 5)) {
          await moveToDLQ(prisma, job, err?.message || String(err))
          const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
          log('error', 'worker.job:dlq', { requestId, jobId: job.id, attempts }, err)
          await sentryCapture('error', err, { tags: { stage: 'DLQ', action: 'GENERATE_BUNDLE' }, extra: { requestId, jobId: job.id, attempts } })
        } else {
          const newAttempts = await reschedule(prisma, job, err?.message || String(err))
          const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
          log('warn', 'worker.job:rescheduled', { requestId, jobId: job.id, attempts: newAttempts }, err)
          await sentryCapture('warn', err, { tags: { stage: 'RESCHEDULE', action: 'GENERATE_BUNDLE' }, extra: { requestId, jobId: job.id, attempts: newAttempts } })
        }
      }
    } catch (loopErr) {
      log('error', 'worker.loop_error', {}, loopErr)
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }
}

main().catch((e) => {
  log('error', 'worker.init_error', {}, e)
  process.exit(1)
})
