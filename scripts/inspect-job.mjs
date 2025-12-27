#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
await prisma.$connect()

const jobs = await prisma.$queryRawUnsafe(
  `SELECT id, type, status, payload, attempts, max_attempts, run_at, last_error, dedupe_key
   FROM xase_jobs
   WHERE type='GENERATE_BUNDLE'
   ORDER BY run_at ASC
   LIMIT 5`
)

console.log(JSON.stringify(jobs, null, 2))

// Check if bundles exist
for (const job of jobs) {
  const payload = typeof job.payload === 'object' ? job.payload : JSON.parse(job.payload)
  const { bundleId, tenantId } = payload
  const bundle = await prisma.evidenceBundle.findFirst({ where: { bundleId, tenantId } })
  console.log(`\nJob ${job.id}: bundleId=${bundleId}, bundle exists=${!!bundle}, bundle.id=${bundle?.id}`)
}

await prisma.$disconnect()
