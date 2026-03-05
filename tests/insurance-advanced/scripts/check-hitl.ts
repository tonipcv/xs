console.warn('[check-hitl] Disabled – demo insurance models removed from Prisma schema.')

export async function checkInsuranceHitl() {
  console.warn('[check-hitl] checkInsuranceHitl invoked, returning stub stats.')
  return {
    total: 0,
    withOverlay: 0,
    withHitl: 0,
  }
}

if (require.main === module) {
  checkInsuranceHitl()
    .then((stats) => {
      console.warn('[check-hitl] Stub stats:', stats)
    })
    .catch((error) => {
      console.error('[check-hitl] Fatal error:', error)
      process.exit(1)
    })
}
