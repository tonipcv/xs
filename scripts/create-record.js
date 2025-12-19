#!/usr/bin/env node
'use strict'

const { randomUUID } = require('crypto')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const API_KEY = process.env.XASE_API_KEY

function idemKey() {
  // UUID v4 para Idempotency-Key
  return randomUUID()
}

async function main() {
  if (!API_KEY) {
    console.error('Missing XASE_API_KEY in environment')
    process.exit(1)
  }

  const url = `${BASE_URL}/api/xase/v1/records`
  const key = idemKey()
  const payload = {
    input: { user_id: 123, amount: Math.floor(Math.random()*10000) },
    output: { decision: 'APPROVED', score: Math.random().toFixed(3) },
    context: { source: 'script', env: process.env.NODE_ENV || 'dev' },
    policyId: 'credit_policy_v4',
    policyVersion: 'v4',
    decisionType: 'CREDIT_APPROVAL',
    confidence: 0.9,
    storePayload: true
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'Idempotency-Key': key,
    },
    body: JSON.stringify(payload)
  })

  const text = await res.text()
  if (!res.ok) {
    console.error('Create record failed:', res.status, text)
    process.exit(1)
  }

  const data = JSON.parse(text)
  console.log('✅ Record created')
  console.log('transaction_id:', data.transaction_id)
  console.log('receipt_url:', data.receipt_url)
}

main().catch((e) => { console.error(e); process.exit(1) })
