console.warn('[run-litigation-demo] Disabled – insurance demo Prisma models removed from schema.')

export async function runLitigationDemo() {
  console.warn('[run-litigation-demo] runLitigationDemo invoked, returning stub response.')
  return { records: 0 }
}

if (require.main === module) {
  runLitigationDemo()
    .then(() => {
      console.warn('[run-litigation-demo] Completed no-op litigation run.')
    })
    .catch((error) => {
      console.error('[run-litigation-demo] Fatal error:', error)
      process.exit(1)
    })
}
