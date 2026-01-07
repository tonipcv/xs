#!/usr/bin/env node

// Diagnostic script for role/HITL issues
// Usage:
//  node scripts/diagnose-role.mjs --email user@example.com [--transaction TXID] [--cookie "next-auth.session-token=..."] [--base http://localhost:3000]

import { PrismaClient } from '@prisma/client'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const prisma = new PrismaClient()

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { email: null, transaction: null, cookie: null, base: 'http://localhost:3000' }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--email') out.email = args[++i]
    else if (a === '--transaction') out.transaction = args[++i]
    else if (a === '--cookie') out.cookie = args[++i]
    else if (a === '--base') out.base = args[++i]
  }
  return out
}

async function fetchWithCookie(urlStr, cookie) {
  const url = new URL(urlStr)
  const lib = url.protocol === 'https:' ? https : http
  const options = {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...(cookie ? { 'Cookie': cookie } : {}),
    },
  }
  return new Promise((resolve, reject) => {
    const req = lib.request(url, options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const body = data ? JSON.parse(data) : null
          resolve({ status: res.statusCode, body })
        } catch (e) {
          resolve({ status: res.statusCode, body: data })
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function main() {
  const { email, transaction, cookie, base } = parseArgs()

  console.log('--- XASE Diagnose: Role / HITL ---')

  // 1) Distinct roles in DB
  try {
    const roles = await prisma.user.findMany({
      select: { xaseRole: true },
      distinct: ['xaseRole'],
      where: {},
    })
    console.log('\n[DB] Distinct xaseRole values:', roles.map(r => r.xaseRole || '(null)'))
  } catch (e) {
    console.error('[DB] Failed to list roles:', e.message || e)
  }

  // 2) Check specific user
  if (email) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, tenantId: true, xaseRole: true, twoFactorEnabled: true },
      })
      if (!user) {
        console.log(`\n[DB] User not found: ${email}`)
      } else {
        console.log('\n[DB] User:')
        console.table([user])
      }
    } catch (e) {
      console.error('[DB] Failed to fetch user:', e.message || e)
    }
  } else {
    console.log('\n[Hint] Pass --email user@example.com to diagnose a specific user')
  }

  // 3) Check interventions for a transaction (optional)
  if (transaction) {
    try {
      const record = await prisma.decisionRecord.findFirst({
        where: { transactionId: transaction },
        select: { id: true, tenantId: true },
      })
      if (!record) {
        console.log(`\n[DB] DecisionRecord not found for transaction: ${transaction}`)
      } else {
        const interventions = await prisma.humanIntervention.findMany({
          where: { recordId: record.id },
          orderBy: { timestamp: 'asc' },
          select: { id: true, action: true, actorName: true, actorEmail: true, actorRole: true, timestamp: true },
        })
        console.log(`\n[DB] Interventions for transaction ${transaction} (tenant ${record.tenantId}):`)
        if (interventions.length === 0) console.log('(none)')
        else console.table(interventions)
      }
    } catch (e) {
      console.error('[DB] Failed to fetch interventions:', e.message || e)
    }
  }

  // 4) Try hitting /api/profile/me (requires cookie)
  if (cookie) {
    try {
      const res = await fetchWithCookie(`${base}/api/profile/me`, cookie)
      console.log(`\n[HTTP] GET /api/profile/me => status ${res.status}`)
      console.dir(res.body, { depth: 5 })
    } catch (e) {
      console.error('[HTTP] Failed to call /api/profile/me:', e.message || e)
    }
  } else {
    console.log('\n[Hint] Pass --cookie "<cookie>" to test /api/profile/me (needs NextAuth session cookie)')
  }

  // 5) Sanity checks
  console.log('\n[Checks] Expectations:')
  console.log('- UI HITL POST requires role in {OWNER, ADMIN, REVIEWER}')
  console.log('- UI HITL GET allows {OWNER, ADMIN, REVIEWER, VIEWER}')
  console.log('- /api/profile/me should return { twoFactorEnabled, role } for authenticated session')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Fatal error:', e)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
