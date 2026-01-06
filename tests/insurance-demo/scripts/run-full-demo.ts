/*
 Run the full insurance demo suite.
 Currently runs: audit demo.
*/

import { runAuditDemo } from './run-audit-demo'

async function main() {
  console.log('[full-demo] Starting...')
  await runAuditDemo()
  console.log('[full-demo] Done.')
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[full-demo] Failed:', e)
    process.exit(1)
  })
}
