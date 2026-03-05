/*
 Advanced audit demo:
 - Reads recent claims from advanced tenant
 - Computes breakdown by claimType, outcome, impact, and risk flags
 - Outputs JSON + MD with metrics and selected examples

 Usage:
   npm run demo2:audit
*/

console.warn('[run-audit-advanced] Disabled – advanced insurance Prisma models removed.')

export async function runInsuranceAudit() {
  console.warn('[run-audit-advanced] runInsuranceAudit invoked, returning stub results.')
  return { records: 0 }
}

if (require.main === module) {
  runInsuranceAudit()
    .then((stats) => {
      console.warn('[run-audit-advanced] Stub stats:', stats)
    })
    .catch((error) => {
      console.error('[run-audit-advanced] Fatal error:', error)
      process.exit(1)
    })
}
