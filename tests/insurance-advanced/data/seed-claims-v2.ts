console.warn('[seed-claims-v2] Disabled in this environment – Prisma demo models removed.')

export async function seedInsuranceAdvancedDemo() {
  console.warn('[seed-claims-v2] seedInsuranceAdvancedDemo called, returning stub response.')
  return { inserted: 0 }
}

if (require.main === module) {
  seedInsuranceAdvancedDemo()
    .then(() => {
      console.warn('[seed-claims-v2] Completed no-op seed run.')
    })
    .catch((error) => {
      console.error('[seed-claims-v2] Fatal error:', error)
      process.exit(1)
    })
}
