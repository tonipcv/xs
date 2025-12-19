#!/usr/bin/env node
'use strict'

// Diagnose DB schema vs Prisma expectations using Prisma Client
// - Checks if User.tenantId column exists
// - Checks if xase_tenants and xase_api_keys tables exist
// - Prints remediation suggestions

async function main() {
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  const url = process.env.DATABASE_URL || '(env DATABASE_URL not set)'
  console.log('DATABASE_URL:', url.split('@').pop())

  // Helper to run raw SQL safely
  const run = async (sql, params = []) => {
    try {
      return await prisma.$queryRawUnsafe(sql, ...params)
    } catch (e) {
      console.error('Query error:', e.message)
      return null
    }
  }

  // Detect current schema and case of table names
  const candidates = ['User', 'user', 'users']
  let userTable = null
  for (const t of candidates) {
    const rows = await run(
      `select table_name from information_schema.tables where table_schema = current_schema() and table_name = $1`,
      [t]
    )
    if (rows && rows.length) { userTable = t; break }
  }

  console.log('User table:', userTable || 'NOT FOUND')

  // List columns for the user table
  let userCols = []
  if (userTable) {
    userCols = await run(
      `select column_name, data_type from information_schema.columns where table_schema = current_schema() and table_name = $1 order by ordinal_position`,
      [userTable]
    ) || []
  }

  const hasTenantId = !!userCols.find(r => r.column_name === 'tenantId')
  console.log('User columns:', userCols?.map(r => r.column_name).join(', ') || 'N/A')
  console.log('Has User.tenantId:', hasTenantId)

  // Check XASE tables
  const needed = ['xase_tenants','xase_api_keys','xase_decision_records','xase_checkpoint_records','xase_audit_logs']
  const present = {}
  for (const t of needed) {
    const rows = await run(
      `select table_name from information_schema.tables where table_schema = current_schema() and table_name = $1`,
      [t]
    )
    present[t] = !!(rows && rows.length)
  }
  console.log('XASE tables presence:', present)

  // Findings summary
  console.log('\n=== Findings ===')
  if (!userTable) {
    console.log('- User table not found. Prisma might be using a different schema or migrations not applied.')
  }
  if (userTable && !hasTenantId) {
    console.log('- Missing column tenantId on', userTable)
  }
  for (const t of needed) {
    if (!present[t]) console.log(`- Missing table ${t}`)
  }

  console.log('\n=== Recommended Fix ===')
  if (!hasTenantId || Object.values(present).some(v => !v)) {
    console.log('- Apply Prisma schema to DB:')
    console.log('  Option A (with migrations history): npx prisma migrate dev')
    console.log('  Option B (push current schema):      npx prisma db push')
    console.log('- Then regenerate client: npx prisma generate')
  } else {
    console.log('- Schema looks OK. Retry the API key creation.')
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
