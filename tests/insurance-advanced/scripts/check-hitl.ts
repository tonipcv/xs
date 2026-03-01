/*
 Quick check for advanced dataset:
 - Confirms InsuranceDecision overlays exist and are populated
 - Confirms HITL (human interventions) rate ~15%

 Usage:
   npm run demo2:check
*/

import { prisma } from '../../../src/lib/prisma'

const DEMO_TENANT_EMAIL = 'demo-insurance-advanced@xase.local'

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { email: DEMO_TENANT_EMAIL } })
  if (!tenant) throw new Error('Advanced demo tenant not found. Run demo2:seed first.')

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const total = await prisma.decisionRecord.count({ where: { tenantId: tenant.id, timestamp: { gte: since } } })
  const withOverlay = await prisma.insuranceDecision.count({ where: { record: { tenantId: tenant.id, timestamp: { gte: since } } } })
  const withHitl = await prisma.decisionRecord.count({ where: { tenantId: tenant.id, timestamp: { gte: since }, hasHumanIntervention: true } })

  const byType = await prisma.insuranceDecision.groupBy({
    by: ['claimType'],
    where: { record: { tenantId: tenant.id, timestamp: { gte: since } } },
    _count: { _all: true },
  })

  const byOutcome = await prisma.insuranceDecision.groupBy({
    by: ['decisionOutcome'],
    where: { record: { tenantId: tenant.id, timestamp: { gte: since } } },
    _count: { _all: true },
  })

  console.log('=== Advanced Dataset Check ===')
  console.log('Tenant:', tenant.email)
  console.log('Total decisionRecords:', total)
  console.log('With InsuranceDecision overlay:', withOverlay)
  console.log('HITL count:', withHitl, `(${((withHitl / Math.max(1, total)) * 100).toFixed(1)}%)`)
  console.log('By Claim Type:', byType)
  console.log('By Outcome:', byOutcome)
}

main()
  .catch((e) => {
    console.error('[check-hitl] Failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
