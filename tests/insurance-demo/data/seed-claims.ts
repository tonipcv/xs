console.warn('[seed-claims] Disabled – insurance demo Prisma models removed from schema.')

export async function seedInsuranceDemo() {
  console.warn('[seed-claims] seedInsuranceDemo invoked, returning stub response.')
  return { inserted: 0 }
}

if (require.main === module) {
  seedInsuranceDemo()
    .then(() => {
      console.warn('[seed-claims] Completed no-op seed run.')
    })
    .catch((error) => {
      console.error('[seed-claims] Fatal error:', error)
      process.exit(1)
    })
}
