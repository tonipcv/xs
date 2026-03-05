console.warn('[run-tamper-demo] Disabled – insurance demo Prisma models removed from schema.')

export async function runTamperDemo() {
  console.warn('[run-tamper-demo] runTamperDemo invoked, returning stub response.')
  return { records: 0 }
}

if (require.main === module) {
  runTamperDemo()
    .then(() => {
      console.warn('[run-tamper-demo] Completed no-op tamper run.')
    })
    .catch((error) => {
      console.error('[run-tamper-demo] Fatal error:', error)
      process.exit(1)
    })
}
