#!/usr/bin/env node
/*
  XASE Pre-Demo Health Check
  ---------------------------
  Validates all systems are ready for demo/production.
*/

import { PrismaClient } from '@prisma/client'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const checks = []
let passed = 0
let failed = 0

function check(name, pass, message) {
  checks.push({ name, pass, message })
  if (pass) {
    console.log(`✅ ${name}`)
    passed++
  } else {
    console.log(`❌ ${name}: ${message}`)
    failed++
  }
}

async function main() {
  console.log('\n🔍 XASE Evidence Bundles - Pre-Demo Health Check\n')

  // 1. Database
  try {
    const prisma = new PrismaClient()
    await prisma.$connect()
    check('Database connection', true)
    
    // Check tables exist
    const jobs = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM xase_jobs`)
    check('Jobs queue table', true)
    
    const bundles = await prisma.evidenceBundle.count()
    check('EvidenceBundle table', bundles >= 0)
    
    const records = await prisma.decisionRecord.count()
    check('DecisionRecord table', records > 0, records === 0 ? 'No test data' : '')
    
    await prisma.$disconnect()
  } catch (e) {
    check('Database connection', false, e.message)
  }

  // 2. Worker process
  try {
    const { stdout } = await execAsync('ps aux | grep worker-bundles-prisma | grep -v grep')
    check('Worker process running', stdout.length > 0, 'Worker not running')
  } catch (e) {
    check('Worker process running', false, 'Worker not running - start with: node scripts/worker-bundles-prisma.mjs')
  }

  // 3. Next.js dev server
  try {
    const response = await fetch('http://localhost:3000/api/auth/session')
    check('Next.js dev server', response.ok)
  } catch (e) {
    check('Next.js dev server', false, 'Server not running - start with: npm run dev')
  }

  // 4. Environment variables
  check('DATABASE_URL', !!process.env.DATABASE_URL, 'Not set')
  check('NEXTAUTH_SECRET', !!process.env.NEXTAUTH_SECRET, 'Not set')
  check('NEXTAUTH_URL', !!process.env.NEXTAUTH_URL, 'Not set')

  // 5. Queue health
  try {
    const prisma = new PrismaClient()
    await prisma.$connect()
    
    const pending = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM xase_jobs WHERE status='PENDING'`)
    const running = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM xase_jobs WHERE status='RUNNING'`)
    const dlq = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM xase_jobs_dlq`)
    
    const pendingCount = Number(pending[0]?.count || 0)
    const runningCount = Number(running[0]?.count || 0)
    const dlqCount = Number(dlq[0]?.count || 0)
    
    check('Queue: No stuck RUNNING jobs', runningCount === 0, `${runningCount} jobs stuck`)
    check('Queue: DLQ acceptable', dlqCount < 5, `${dlqCount} jobs in DLQ`)
    
    console.log(`\n📊 Queue Status: PENDING=${pendingCount}, RUNNING=${runningCount}, DLQ=${dlqCount}`)
    
    await prisma.$disconnect()
  } catch (e) {
    check('Queue health', false, e.message)
  }

  // 6. Bundle status
  try {
    const prisma = new PrismaClient()
    await prisma.$connect()
    
    const ready = await prisma.evidenceBundle.count({ where: { status: 'READY' } })
    const processing = await prisma.evidenceBundle.count({ where: { status: 'PROCESSING' } })
    const failed = await prisma.evidenceBundle.count({ where: { status: 'FAILED' } })
    
    check('Bundles: Has READY bundles', ready > 0, 'No READY bundles for demo')
    check('Bundles: No stuck PROCESSING', processing === 0, `${processing} bundles stuck`)
    check('Bundles: No FAILED', failed === 0, `${failed} bundles failed`)
    
    console.log(`\n📦 Bundles: READY=${ready}, PROCESSING=${processing}, FAILED=${failed}`)
    
    await prisma.$disconnect()
  } catch (e) {
    check('Bundle status', false, e.message)
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`${'='.repeat(60)}\n`)

  if (failed === 0) {
    console.log('🎉 All systems ready for demo!\n')
    process.exit(0)
  } else {
    console.log('⚠️  Fix issues above before demo\n')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('❌ Health check failed:', e)
  process.exit(99)
})
