#!/usr/bin/env node
/*
  XASE Queue Status Checker
  -------------------------
  Quick health check for the Postgres job queue.
  Shows pending/running/done/dlq counts and next scheduled jobs.

  Usage:
    node scripts/check-queue-status.mjs
*/

import { PrismaClient } from '@prisma/client'

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

  // Counts by status
  const pending = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM xase_jobs WHERE status='PENDING'`)
  const running = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM xase_jobs WHERE status='RUNNING'`)
  const done = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM xase_jobs WHERE status='DONE'`)
  const dlq = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM xase_jobs_dlq`)

  log('info', 'queue.status', {
    pending: Number(pending[0]?.count || 0),
    running: Number(running[0]?.count || 0),
    done: Number(done[0]?.count || 0),
    dlq: Number(dlq[0]?.count || 0),
  })

  // Next due jobs
  const due = await prisma.$queryRawUnsafe(
    `SELECT id, type, status, attempts, max_attempts, run_at, last_error
     FROM xase_jobs
     WHERE status='PENDING' AND run_at <= NOW()
     ORDER BY run_at ASC
     LIMIT 5`
  )
  if (due && due.length > 0) {
    log('info', 'queue.due_jobs', { count: due.length, jobs: due })
  } else {
    log('info', 'queue.no_due_jobs')
  }

  // Next scheduled (future)
  const scheduled = await prisma.$queryRawUnsafe(
    `SELECT id, type, status, attempts, max_attempts, run_at, last_error
     FROM xase_jobs
     WHERE status='PENDING' AND run_at > NOW()
     ORDER BY run_at ASC
     LIMIT 5`
  )
  if (scheduled && scheduled.length > 0) {
    log('info', 'queue.scheduled_jobs', { count: scheduled.length, jobs: scheduled })
  }

  // Bundles status
  const bundlesPending = await prisma.evidenceBundle.count({ where: { status: 'PENDING' } })
  const bundlesProcessing = await prisma.evidenceBundle.count({ where: { status: 'PROCESSING' } })
  const bundlesReady = await prisma.evidenceBundle.count({ where: { status: 'READY' } })
  const bundlesFailed = await prisma.evidenceBundle.count({ where: { status: 'FAILED' } })

  log('info', 'bundles.status', {
    pending: bundlesPending,
    processing: bundlesProcessing,
    ready: bundlesReady,
    failed: bundlesFailed,
  })

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(99)
})
