#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
await prisma.$connect()

await prisma.$executeRawUnsafe(
  `UPDATE xase_jobs SET status='PENDING', run_at=NOW(), attempts=0, last_error=NULL WHERE type='GENERATE_BUNDLE' AND status='PENDING'`
)

console.log('✓ All GENERATE_BUNDLE jobs forced to run now')
await prisma.$disconnect()
