console.warn('[clean-tenant] Disabled – insurance demo tables removed from Prisma schema.')

export async function cleanInsuranceTenant() {
  console.warn('[clean-tenant] cleanInsuranceTenant invoked, nothing to delete.')
  return { deleted: 0 }
}

if (require.main === module) {
  cleanInsuranceTenant()
    .then(() => {
      console.warn('[clean-tenant] Completed no-op cleanup.')
    })
    .catch((error) => {
      console.error('[clean-tenant] Fatal error:', error)
      process.exit(1)
    })
}
