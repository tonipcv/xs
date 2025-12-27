#!/usr/bin/env node
/*
  XASE Job Reset Helper
  ---------------------
  Reset a job to PENDING and make it due now, by job UUID or by bundleId (dedupe_key/payload).

  Usage:
    node scripts/jobs-reset.mjs --job <job_uuid>
    node scripts/jobs-reset.mjs --bundle <bundleId>
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

  const jobId = flags.get('job')
  const bundleId = flags.get('bundle')

  if (!jobId && !bundleId) {
    console.error('Usage: node scripts/jobs-reset.mjs --job <uuid> | --bundle <bundleId>')
    process.exit(2)
  }

  let target
  if (jobId) {
    // Try UUID cast, else error
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM xase_jobs WHERE id = $1::uuid`, jobId)
      target = rows?.[0]
    } catch (e) {
      log('error', 'reset.lookup_failed', { error: String(e) })
      process.exit(3)
    }
  } else if (bundleId) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM xase_jobs
       WHERE dedupe_key = $1 OR (payload ->> 'bundleId') = $1
       ORDER BY run_at ASC
       LIMIT 1`,
      bundleId
    )
    target = rows?.[0]
  }

  if (!target) {
    log('error', 'reset.no_job_found', { jobId: jobId || null, bundleId: bundleId || null })
    process.exit(4)
  }

  await prisma.$executeRawUnsafe(
    `UPDATE xase_jobs
     SET status = 'PENDING', run_at = NOW(), last_error = NULL
     WHERE id = $1::uuid`,
    target.id
  )

  log('info', 'reset.ok', { id: target.id, type: target.type })
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(99) })
