#!/usr/bin/env node
'use strict'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const API_KEY = process.env.XASE_API_KEY

async function main() {
  if (!API_KEY) {
    console.error('Missing XASE_API_KEY in environment')
    process.exit(1)
  }

  const url = `${BASE_URL}/api/xase/v1/records?limit=1`
  const res = await fetch(url, {
    headers: { 'X-API-Key': API_KEY },
  })

  if (!res.ok) {
    console.error('Health check failed:', res.status, await res.text())
    process.exit(1)
  }

  const data = await res.json()
  const count = data?.pagination?.total ?? data?.records?.length ?? 0
  console.log('✅ API reachable. Records total:', count)
}

main().catch((e) => { console.error(e); process.exit(1) })
