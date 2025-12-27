#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
await prisma.$connect()

const bundle = await prisma.evidenceBundle.findFirst({
  where: { bundleId: 'bundle_5b2ea7e22fca98b87c705e75d27ac97d' },
})

console.log(JSON.stringify(bundle, null, 2))

await prisma.$disconnect()
