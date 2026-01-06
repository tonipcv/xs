/*
 Simulate an FCA audit: select 50 random claims from the last 90 days
 for the demo tenant and generate a court-ready summary manifest.

 Usage:
   npx ts-node tests/insurance-demo/scripts/run-audit-demo.ts
*/

import fs from 'fs'
import path from 'path'
import { prisma } from '../../../src/lib/prisma'

const DEMO_TENANT_EMAIL = 'demo-insurance@xase.local'
const REPORTS_DIR = path.join(process.cwd(), 'tests/insurance-demo/reports')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function sample<T>(arr: T[], k: number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, Math.min(k, a.length))
}

export async function runAuditDemo() {
  const startedAt = new Date()
  ensureDir(REPORTS_DIR)

  const tenant = await prisma.tenant.findFirst({ where: { email: DEMO_TENANT_EMAIL } })
  if (!tenant) throw new Error('Demo tenant not found. Run seed first.')

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  // Fetch up to 2000 records (sufficient for demo)
  const records = await prisma.decisionRecord.findMany({
    where: { tenantId: tenant.id, timestamp: { gte: since } },
    orderBy: { timestamp: 'desc' },
    take: 2000,
    include: {
      insuranceDecision: true,
    },
  })

  if (records.length === 0) throw new Error('No records found for demo tenant. Run seed first.')

  const selected = sample(records, 50)

  const items = selected.map((r) => ({
    transactionId: r.transactionId,
    timestamp: r.timestamp.toISOString(),
    decisionType: r.decisionType,
    confidence: r.confidence,
    policyId: r.policyId,
    policyVersion: r.policyVersion,
    recordHash: r.recordHash,
    previousHash: r.previousHash,
    finalDecisionSource: r.finalDecisionSource,
    hasHumanIntervention: r.hasHumanIntervention,
    insurance: r.insuranceDecision
      ? {
          claimNumber: r.insuranceDecision.claimNumber,
          claimType: r.insuranceDecision.claimType,
          claimAmount: r.insuranceDecision.claimAmount?.toString(),
          policyNumber: r.insuranceDecision.policyNumber,
          decisionOutcome: r.insuranceDecision.decisionOutcome,
          decisionImpact: r.insuranceDecision.decisionImpactConsumerImpact,
        }
      : null,
  }))

  const summary = {
    tenant: { id: tenant.id, email: tenant.email, name: tenant.name },
    period: { from: since.toISOString(), to: new Date().toISOString() },
    totals: {
      records_available: records.length,
      records_selected: items.length,
      with_intervention: items.filter((i) => i.hasHumanIntervention).length,
    },
    generated_at: new Date().toISOString(),
    items,
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outJson = path.join(REPORTS_DIR, `audit-${stamp}.json`)
  const outMd = path.join(REPORTS_DIR, `audit-${stamp}.md`)

  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2))

  const mdLines: string[] = []
  mdLines.push(`# FCA Audit Demo Report`)
  mdLines.push('')
  mdLines.push(`- Tenant: ${tenant.name} (${tenant.email})`)
  mdLines.push(`- Period: ${summary.period.from} → ${summary.period.to}`)
  mdLines.push(`- Records available: ${summary.totals.records_available}`)
  mdLines.push(`- Records selected: ${summary.totals.records_selected}`)
  mdLines.push(`- With interventions: ${summary.totals.with_intervention}`)
  mdLines.push('')
  mdLines.push('## Items')
  for (const i of items) {
    mdLines.push(`- ${i.timestamp} — ${i.transactionId} — ${i.insurance?.claimNumber || 'N/A'} — ${i.insurance?.decisionOutcome || 'N/A'} — conf=${i.confidence ?? 'n/a'}`)
  }
  fs.writeFileSync(outMd, mdLines.join('\n'))

  const finishedAt = new Date()
  console.log(`[audit-demo] Report written to:`)
  console.log(`  - ${outJson}`)
  console.log(`  - ${outMd}`)
  console.log(`[audit-demo] Duration: ${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)}s`)
}

if (require.main === module) {
  runAuditDemo()
    .catch((e) => {
      console.error('[audit-demo] Failed:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
