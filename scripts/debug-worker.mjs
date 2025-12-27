#!/usr/bin/env node
/*
  XASE Worker Debug Script (Prisma-based)
  --------------------------------------
  Diagnoses why GENERATE_BUNDLE jobs are being rescheduled/failing by:
    - Claiming (dry) the next PENDING job via SQL
    - Parsing payload (bundleId, tenantId, dateFilter)
    - Validating bundle exists (Prisma)
    - Counting decision records in range (Prisma)
    - Printing detailed diagnostics (counts, min/max timestamps)

  Usage:
    node scripts/debug-worker.mjs [--job <jobId>] [--verbose]

  Requirements:
    DATABASE_URL must be set
*/

import { PrismaClient } from '@prisma/client'

const args = process.argv.slice(2)
const flags = new Map()
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].replace(/^--/, '')
    const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true
    flags.set(key, val)
  }
}

function log(level, message, ctx = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...ctx }))
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('✖ DATABASE_URL not set')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  await prisma.$connect()
  log('info', 'debug.start')

  let job
  const selectJobId = flags.get('job')
  if (selectJobId && typeof selectJobId === 'string') {
    // Try as UUID first (cast), else try by dedupe_key or payload->>'bundleId'
    let rows = []
    try {
      rows = await prisma.$queryRawUnsafe(`SELECT * FROM xase_jobs WHERE id = $1::uuid`, selectJobId)
    } catch {}
    if (!rows || rows.length === 0) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM xase_jobs
         WHERE dedupe_key = $1 OR (payload ->> 'bundleId') = $1
         ORDER BY run_at ASC
         LIMIT 1`,
        selectJobId
      )
    }
    job = rows?.[0]
    if (!job) {
      log('error', 'debug.job_not_found', { jobId: selectJobId })
      // Also show next scheduled jobs to help
      const peek = await prisma.$queryRawUnsafe(
        `SELECT id, type, status, attempts, max_attempts, run_at, last_error
         FROM xase_jobs
         ORDER BY run_at ASC
         LIMIT 5`
      )
      log('info', 'debug.peek_jobs', { jobs: peek })
      process.exit(2)
    }
  } else {
    // Peek next due job (do NOT update status)
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM xase_jobs
       WHERE status='PENDING' AND run_at <= NOW()
       ORDER BY run_at ASC
       LIMIT 1`
    )
    job = rows?.[0]
    if (!job) {
      log('warn', 'debug.no_pending_jobs')
      const nextRows = await prisma.$queryRawUnsafe(
        `SELECT id, type, status, attempts, max_attempts, run_at, last_error
         FROM xase_jobs
         ORDER BY run_at ASC
         LIMIT 5`
      )
      if (nextRows && nextRows.length > 0) {
        log('info', 'debug.next_scheduled', { jobs: nextRows })
      }
      process.exit(0)
    }
  }

  log('info', 'debug.job_loaded', { jobId: job.id, type: job.type, attempts: job.attempts, run_at: job.run_at })

  if (job.type !== 'GENERATE_BUNDLE') {
    log('warn', 'debug.unsupported_type', { type: job.type })
    process.exit(0)
  }

  let payload
  try {
    payload = typeof job.payload === 'object' ? job.payload : JSON.parse(job.payload)
  } catch (e) {
    log('error', 'debug.payload_parse_error', { error: String(e) })
    process.exit(3)
  }

  const { bundleId, tenantId, dateFilter } = payload || {}
  if (!bundleId || !tenantId) {
    log('error', 'debug.payload_missing_fields', { payload })
    process.exit(4)
  }

  // 1) Bundle exists?
  const bundle = await prisma.evidenceBundle.findFirst({ where: { bundleId, tenantId } })
  if (!bundle) {
    log('error', 'debug.bundle_not_found', { bundleId, tenantId })
    process.exit(5)
  }
  log('info', 'debug.bundle_ok', { id: bundle.id, status: bundle.status, createdAt: bundle.createdAt?.toISOString?.() })

  // 2) Records in range?
  const where = {
    tenantId,
    ...(dateFilter && Object.keys(dateFilter).length > 0
      ? { timestamp: {
          ...(dateFilter.gte ? { gte: new Date(dateFilter.gte) } : {}),
          ...(dateFilter.lte ? { lte: new Date(dateFilter.lte) } : {}),
        } }
      : {}),
  }

  const count = await prisma.decisionRecord.count({ where })
  log('info', 'debug.records_count', { count })

  if (count > 0) {
    const first = await prisma.decisionRecord.findFirst({ where, orderBy: { timestamp: 'asc' } })
    const last = await prisma.decisionRecord.findFirst({ where, orderBy: { timestamp: 'desc' } })
    log('info', 'debug.records_range', { first: first?.timestamp?.toISOString?.(), last: last?.timestamp?.toISOString?.() })
  }

  // 3) Retention flags
  log('info', 'debug.bundle_retention', {
    legalHold: bundle.legalHold ?? null,
    retentionUntil: bundle.retentionUntil ? new Date(bundle.retentionUntil).toISOString() : null,
    expiresAt: bundle.expiresAt ? new Date(bundle.expiresAt).toISOString() : null,
  })

  // 4) Ready to process?
  if (bundle.status === 'READY') {
    log('info', 'debug.idempotent_already_ready', { bundleId })
  } else {
    log('info', 'debug.ready_to_process', { bundleId })
  }

  await prisma.$disconnect()
  log('info', 'debug.done')
}

main().catch((e) => {
  console.error(e)
  process.exit(99)
})
