/*
 Litigation/contestability demo:
 - Pick a denied claim and find a similar approved claim (same type, similar amount)
 - Output a side-by-side report (decision inputs/outputs, model metadata, confidence)
 - Provide a simple counterfactual suggestion area (placeholder)

 Usage:
   npm run demo:litigation
*/

import fs from 'fs'
import path from 'path'
import { prisma } from '../../../src/lib/prisma'

const DEMO_TENANT_EMAIL = 'demo-insurance@xase.local'
const REPORTS_DIR = path.join(process.cwd(), 'tests/insurance-demo/reports')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function amountClose(a: number, b: number, pct = 0.15) {
  const d = Math.abs(a - b)
  return d <= Math.max(a, b) * pct
}

export async function runLitigationDemo() {
  ensureDir(REPORTS_DIR)

  const tenant = await prisma.tenant.findFirst({ where: { email: DEMO_TENANT_EMAIL } })
  if (!tenant) throw new Error('Demo tenant not found. Run seed first.')

  // Get recent denied claims
  const denied = await prisma.decisionRecord.findMany({
    where: {
      tenantId: tenant.id,
      insuranceDecision: { is: { decisionOutcome: 'REJECTED' } },
    },
    orderBy: { timestamp: 'desc' },
    take: 200,
    include: { insuranceDecision: true },
  })

  if (denied.length === 0) throw new Error('No denied claims found in demo data.')

  let pair: any = null
  // For each denied, find an approved similar
  for (const d of denied) {
    const claimType = d.insuranceDecision?.claimType
    const amount = Number(d.insuranceDecision?.claimAmount || 0)

    const approved = await prisma.decisionRecord.findFirst({
      where: {
        tenantId: tenant.id,
        insuranceDecision: {
          is: {
            decisionOutcome: 'APPROVED',
            claimType: claimType,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      include: { insuranceDecision: true },
    })

    if (approved && amountClose(Number(approved.insuranceDecision?.claimAmount || 0), amount, 0.20)) {
      pair = { denied: d, approved }
      break
    }
  }

  if (!pair) throw new Error('Could not find a suitable pair (denied vs approved similar).')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outJson = path.join(REPORTS_DIR, `litigation-${stamp}.json`)
  const outMd = path.join(REPORTS_DIR, `litigation-${stamp}.md`)

  const view = (r: any) => ({
    transactionId: r.transactionId,
    timestamp: r.timestamp.toISOString(),
    decisionType: r.decisionType,
    confidence: r.confidence,
    modelId: r.modelId,
    modelVersion: r.modelVersion,
    recordHash: r.recordHash,
    insurance: r.insuranceDecision
      ? {
          claimNumber: r.insuranceDecision.claimNumber,
          claimType: r.insuranceDecision.claimType,
          claimAmount: r.insuranceDecision.claimAmount?.toString(),
          policyNumber: r.insuranceDecision.policyNumber,
          decisionOutcome: r.insuranceDecision.decisionOutcome,
        }
      : null,
  })

  const result = {
    tenant: { id: tenant.id, email: tenant.email, name: tenant.name },
    generated_at: new Date().toISOString(),
    denied: view(pair.denied),
    approved: view(pair.approved),
    hints: {
      counterfactual: 'Adjust risk factors or business rules to test minimal change explanations (placeholder).',
      similarity_criteria: 'claimType match + amount within 20% range',
    },
  }

  fs.writeFileSync(outJson, JSON.stringify(result, null, 2))

  const md = `# Litigation Demo Report\n\n- Tenant: ${tenant.name} (${tenant.email})\n- Generated: ${result.generated_at}\n\n## Denied Claim\n- Tx: ${result.denied.transactionId}\n- Date: ${result.denied.timestamp}\n- Type: ${result.denied.insurance?.claimType}\n- Amount: £${result.denied.insurance?.claimAmount}\n- Outcome: ${result.denied.insurance?.decisionOutcome}\n- Confidence: ${result.denied.confidence}\n- Model: ${result.denied.modelId}@${result.denied.modelVersion}\n\n## Approved Similar Claim\n- Tx: ${result.approved.transactionId}\n- Date: ${result.approved.timestamp}\n- Type: ${result.approved.insurance?.claimType}\n- Amount: £${result.approved.insurance?.claimAmount}\n- Outcome: ${result.approved.insurance?.decisionOutcome}\n- Confidence: ${result.approved.confidence}\n- Model: ${result.approved.modelId}@${result.approved.modelVersion}\n\n## Counterfactual (placeholder)\n- Suggestion: Review thresholds and risk factors to generate minimal-change explanation.\n- Note: In production, integrate SHAP/LIME or business rule diffs at decision time.\n`
  fs.writeFileSync(outMd, md)

  console.log('[litigation-demo] Report written to:')
  console.log(`  - ${outJson}`)
  console.log(`  - ${outMd}`)
}

if (require.main === module) {
  runLitigationDemo()
    .catch((e) => {
      console.error('[litigation-demo] Failed:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
