/*
 Advanced audit demo:
 - Reads recent claims from advanced tenant
 - Computes breakdown by claimType, outcome, impact, and risk flags
 - Outputs JSON + MD with metrics and selected examples

 Usage:
   npm run demo2:audit
*/

import fs from 'fs'
import path from 'path'
import { prisma } from '../../../src/lib/prisma'

const DEMO_TENANT_EMAIL = process.env.DEMO2_EMAIL || 'demo-insurance-advanced@xase.local'
const REPORTS_DIR = path.join(process.cwd(), 'tests/insurance-advanced/reports')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

type Outcome = 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW'

export async function runAuditAdvanced() {
  const startedAt = Date.now()
  ensureDir(REPORTS_DIR)

  const tenant = await prisma.tenant.findFirst({ where: { email: DEMO_TENANT_EMAIL } })
  if (!tenant) throw new Error('Advanced demo tenant not found. Run demo2:seed first.')

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const records = await prisma.decisionRecord.findMany({
    where: {
      tenantId: tenant.id,
      timestamp: { gte: since },
      // Only consider records that have InsuranceDecision overlay for demo clarity
      insuranceDecision: { isNot: null },
    },
    orderBy: { timestamp: 'desc' },
    take: 2000,
    include: { insuranceDecision: true, interventions: true },
  })

  const items = records.map((r) => ({
    tx: r.transactionId,
    ts: r.timestamp.toISOString(),
    claimType: r.insuranceDecision?.claimType || 'UNKNOWN',
    outcome: r.insuranceDecision?.decisionOutcome as Outcome,
    amount: Number(r.insuranceDecision?.claimAmount || 0),
    impact: r.insuranceDecision?.decisionImpactConsumerImpact,
    confidence: r.confidence ?? null,
    model: r.modelId ? `${r.modelId}@${r.modelVersion}` : null,
    hasHumanIntervention: r.hasHumanIntervention,
  }))

  // Metrics
  const by = <K extends keyof (typeof items)[number]>(key: K) =>
    items.reduce<Record<string, number>>((acc, it) => {
      const k = String((it as any)[key] || 'UNKNOWN')
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})

  const sumByOutcome: Record<Outcome, number> = { APPROVED: 0, REJECTED: 0, MANUAL_REVIEW: 0 }
  let lowConfidence = 0
  let totalAmountApproved = 0
  let countApproved = 0
  let totalAmountRejected = 0
  let countRejected = 0

  for (const it of items) {
    if (it.outcome && sumByOutcome[it.outcome] !== undefined) {
      sumByOutcome[it.outcome]++
    }
    if (it.confidence !== null && it.confidence < 0.7) lowConfidence++
    if (it.outcome === 'APPROVED') {
      totalAmountApproved += it.amount
      countApproved++
    }
    if (it.outcome === 'REJECTED') {
      totalAmountRejected += it.amount
      countRejected++
    }
  }

  const avgAmountApproved = countApproved ? Math.round(totalAmountApproved / countApproved) : 0
  const avgAmountRejected = countRejected ? Math.round(totalAmountRejected / countRejected) : 0

  const breakdown = {
    byClaimType: by('claimType'),
    byOutcome: sumByOutcome,
    byImpact: by('impact'),
    withHumanIntervention: items.filter((i) => i.hasHumanIntervention).length,
    riskFlags: { confidence_lt_0_70: lowConfidence },
    averageAmount: { approved: avgAmountApproved, rejected: avgAmountRejected },
  }

  const summary = {
    tenant: { id: tenant.id, email: tenant.email, name: tenant.name },
    period: { from: since.toISOString(), to: new Date().toISOString() },
    totals: { records: items.length },
    breakdown,
    samples: items.slice(0, 10),
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outJson = path.join(REPORTS_DIR, `audit-advanced-${stamp}.json`)
  const outMd = path.join(REPORTS_DIR, `audit-advanced-${stamp}.md`)

  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2))

  const mdLines: string[] = []
  mdLines.push(`# Advanced Audit Demo Report`)
  mdLines.push('')
  mdLines.push(`- Tenant: ${tenant.name} (${tenant.email})`)
  mdLines.push(`- Period: ${summary.period.from} → ${summary.period.to}`)
  mdLines.push(`- Records: ${summary.totals.records}`)
  mdLines.push(`- With Human Interventions: ${summary.breakdown.withHumanIntervention}`)
  mdLines.push(`- Risk (confidence < 0.70): ${summary.breakdown.riskFlags.confidence_lt_0_70}`)
  mdLines.push('')
  mdLines.push(`## Breakdown`)
  mdLines.push(`- By Claim Type: ${JSON.stringify(summary.breakdown.byClaimType)}`)
  mdLines.push(`- By Outcome: ${JSON.stringify(summary.breakdown.byOutcome)}`)
  mdLines.push(`- By Impact: ${JSON.stringify(summary.breakdown.byImpact)}`)
  mdLines.push(`- Avg Amount (Approved): £${summary.breakdown.averageAmount.approved}`)
  mdLines.push(`- Avg Amount (Rejected): £${summary.breakdown.averageAmount.rejected}`)
  mdLines.push('')
  mdLines.push('## Samples (first 10)')
  for (const s of summary.samples) {
    mdLines.push(`- ${s.ts} — ${s.tx} — ${s.claimType} — ${s.outcome} — £${s.amount} — conf=${s.confidence ?? 'n/a'} — model=${s.model ?? 'n/a'} — HITL=${s.hasHumanIntervention}`)
  }

  fs.writeFileSync(outMd, mdLines.join('\n'))

  console.log('[audit-advanced] Report written to:')
  console.log(`  - ${outJson}`)
  console.log(`  - ${outMd}`)
  console.log(`[audit-advanced] Duration: ${summary.duration_ms}ms`)
}

if (require.main === module) {
  runAuditAdvanced()
    .catch((e) => {
      console.error('[audit-advanced] Failed:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
