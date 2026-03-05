console.warn('[run-audit-demo] Disabled – insurance demo Prisma models removed from schema.')

export async function runAuditDemo() {
  console.warn('[run-audit-demo] runAuditDemo invoked, returning stub response.')
  return { records: 0 }
}

if (require.main === module) {
  runAuditDemo()
    .then(() => {
      console.warn('[run-audit-demo] Completed no-op audit run.')
    })
    .catch((error) => {
      console.error('[run-audit-demo] Fatal error:', error)
      process.exit(1)
    })
}
