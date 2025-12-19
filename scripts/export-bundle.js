#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const API_KEY = process.env.XASE_API_KEY

async function main() {
  const tx = process.argv[2]
  if (!tx) {
    console.error('Usage: node scripts/export-bundle.js <transaction_id> [outfile]')
    process.exit(1)
  }
  if (!API_KEY) {
    console.error('Missing XASE_API_KEY in environment')
    process.exit(1)
  }

  const out = process.argv[3] || `evidence_${tx}.zip`
  const url = `${BASE_URL}/api/xase/v1/export/${encodeURIComponent(tx)}/download`
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY } })
  if (!res.ok) {
    console.error('Export failed:', res.status, await res.text())
    process.exit(1)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(path.resolve(out), buf)
  console.log('✅ Exported bundle:', out)
}

main().catch((e) => { console.error(e); process.exit(1) })
