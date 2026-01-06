/*
 Clean advanced tenant data for fresh seed
 
 Usage:
   npm run demo2:clean
*/

import { prisma } from '../../../src/lib/prisma'

const DEMO_TENANT_EMAIL = 'demo-insurance-advanced@xase.local'

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { email: DEMO_TENANT_EMAIL } })
  if (!tenant) {
    console.log('[clean] Advanced demo tenant not found. Nothing to clean.')
    return
  }

  console.log('[clean] Cleaning tenant:', tenant.email)

  // Delete in correct order (respecting foreign keys)
  const deletedInterventions = await prisma.humanIntervention.deleteMany({ where: { tenantId: tenant.id } })
  console.log('[clean] Deleted interventions:', deletedInterventions.count)

  const deletedInsurance = await prisma.insuranceDecision.deleteMany({ where: { record: { tenantId: tenant.id } } })
  console.log('[clean] Deleted insurance decisions:', deletedInsurance.count)

  const deletedSnapshots = await prisma.evidenceSnapshot.deleteMany({ where: { tenantId: tenant.id } })
  console.log('[clean] Deleted snapshots:', deletedSnapshots.count)

  const deletedRecords = await prisma.decisionRecord.deleteMany({ where: { tenantId: tenant.id } })
  console.log('[clean] Deleted decision records:', deletedRecords.count)

  console.log('[clean] Done. Tenant is clean and ready for fresh seed.')
}

main()
  .catch((e) => {
    console.error('[clean] Failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
