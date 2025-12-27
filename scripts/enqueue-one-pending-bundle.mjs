#!/usr/bin/env node
/*
  Enqueue a GENERATE_BUNDLE job for one PENDING bundle
*/
import { PrismaClient } from '@prisma/client'

function log(level, message, ctx = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...ctx }))
}

async function main() {
  const prisma = new PrismaClient()
  await prisma.$connect()

  // Pick one PENDING bundle
  const bundle = await prisma.evidenceBundle.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } })
  if (!bundle) {
    log('info', 'enqueue.no_pending_bundles')
    process.exit(0)
  }
  const payload = { bundleId: bundle.bundleId, tenantId: bundle.tenantId, dateFilter: { gte: bundle.dateFrom, lte: bundle.dateTo } }

  // Insert job into xase_jobs if not exists (dedupe by bundleId)
  const now = new Date()
  const jobIdRows = await prisma.$queryRawUnsafe(
    `WITH upsert AS (
       INSERT INTO xase_jobs (type, payload, dedupe_key, status, attempts, max_attempts, run_at, created_at, updated_at)
       VALUES ('GENERATE_BUNDLE', $1::jsonb, $2, 'PENDING', 0, 5, NOW(), NOW(), NOW())
       ON CONFLICT (dedupe_key) DO UPDATE SET run_at = EXCLUDED.run_at, updated_at = NOW(), status='PENDING'
       RETURNING id
     )
     SELECT id FROM upsert
     UNION
     SELECT id FROM xase_jobs WHERE dedupe_key = $2
     LIMIT 1;`,
    JSON.stringify(payload),
    bundle.bundleId
  )

  log('info', 'enqueue.ok', { jobId: jobIdRows?.[0]?.id, bundleId: bundle.bundleId })
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(99) })
