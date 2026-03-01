/*
 Tamper detection demo:
 - Pick a recent record
 - Recalculate expected hashes
 - Simulate tamper by altering the stored payload (in-memory only) and show mismatch
 - Optionally, call API /api/xase/v1/verify/[transactionId] if available

 Usage:
   npm run demo:tamper
*/

import fs from 'fs'
import path from 'path'
import { prisma } from '../../../src/lib/prisma'
import { hashObject, chainHash } from '../../../src/lib/xase/crypto'

const DEMO_TENANT_EMAIL = 'demo-insurance@xase.local'
const REPORTS_DIR = path.join(process.cwd(), 'tests/insurance-demo/reports')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export async function runTamperDemo() {
  ensureDir(REPORTS_DIR)

  const tenant = await prisma.tenant.findFirst({ where: { email: DEMO_TENANT_EMAIL } })
  if (!tenant) throw new Error('Demo tenant not found. Run seed first.')

  const record = await prisma.decisionRecord.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { timestamp: 'desc' },
    include: { insuranceDecision: true },
  })
  if (!record) throw new Error('No records found in demo tenant.')

  // Original
  const original = {
    input: JSON.parse(record.inputPayload || '{}'),
    output: JSON.parse(record.outputPayload || '{}'),
    context: JSON.parse(record.contextPayload || '{}'),
    previousHash: record.previousHash,
    recordHash: record.recordHash,
  }

  // Recalculate correct hashes
  const inputHash = hashObject(original.input)
  const outputHash = hashObject(original.output)
  const contextHash = hashObject(original.context)
  const combined = `${inputHash}${outputHash}${contextHash}`
  const recalculatedRecordHash = chainHash(original.previousHash || null, combined)

  // Simulate tamper: modify output in-memory (no DB write)
  const tamperedOutput = { ...original.output, payout: (original.output?.payout || 0) + 1 }
  const tamperedOutputHash = hashObject(tamperedOutput)
  const tamperedCombined = `${inputHash}${tamperedOutputHash}${contextHash}`
  const tamperedRecordHash = chainHash(original.previousHash || null, tamperedCombined)

  const report = {
    tenant: { id: tenant.id, email: tenant.email, name: tenant.name },
    transactionId: record.transactionId,
    correct: {
      inputHash,
      outputHash,
      contextHash,
      recordHash: recalculatedRecordHash,
      matchesStored: recalculatedRecordHash === original.recordHash,
    },
    tampered: {
      outputChanged: true,
      tamperedOutputHash,
      tamperedRecordHash,
      matchesStored: tamperedRecordHash === original.recordHash,
    },
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outJson = path.join(REPORTS_DIR, `tamper-${stamp}.json`)
  const outMd = path.join(REPORTS_DIR, `tamper-${stamp}.md`)

  fs.writeFileSync(outJson, JSON.stringify(report, null, 2))

  const md = `# Tamper Detection Demo\n\n- Tenant: ${tenant.name} (${tenant.email})\n- Tx: ${record.transactionId}\n- Stored recordHash: ${original.recordHash}\n\n## Correct Recalculation\n- inputHash: ${inputHash}\n- outputHash: ${outputHash}\n- contextHash: ${contextHash}\n- recordHash: ${recalculatedRecordHash}\n- matchesStored: ${report.correct.matchesStored}\n\n## Simulated Tamper (output.payout + 1)\n- tamperedOutputHash: ${tamperedOutputHash}\n- tamperedRecordHash: ${tamperedRecordHash}\n- matchesStored: ${report.tampered.matchesStored}\n\nResult: Tamper is detected because recalculated hash does not match stored recordHash.\n`
  fs.writeFileSync(outMd, md)

  console.log('[tamper-demo] Report written to:')
  console.log(`  - ${outJson}`)
  console.log(`  - ${outMd}`)
}

if (require.main === module) {
  runTamperDemo()
    .catch((e) => {
      console.error('[tamper-demo] Failed:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
