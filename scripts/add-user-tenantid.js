#!/usr/bin/env node
'use strict'

// Adds User.tenantId column (nullable), index, and FK to xase_tenants(id) if missing.
// Safe to run multiple times. Requires DATABASE_URL env. Works on PostgreSQL.

async function main() {
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  const run = async (sql, ...params) => prisma.$queryRawUnsafe(sql, ...params)

  // Resolve actual user table name (User vs user vs users)
  const userCandidates = ['User', 'user', 'users']
  let userTable = null
  for (const t of userCandidates) {
    const rows = await run(
      'select table_name from information_schema.tables where table_schema = current_schema() and table_name = $1',
      t
    ).catch(() => null)
    if (rows && rows.length) { userTable = t; break }
  }
  if (!userTable) {
    console.error('User table not found in current schema. Aborting.')
    process.exit(1)
  }

  // Check if tenantId exists
  const cols = await run(
    'select column_name from information_schema.columns where table_schema = current_schema() and table_name = $1',
    userTable
  ).catch(() => [])
  const hasTenantId = !!cols.find(r => r.column_name === 'tenantId')

  if (!hasTenantId) {
    console.log(`Adding column tenantId to ${userTable}...`)
    await run(`alter table "${userTable}" add column "tenantId" text null`).catch((e) => {
      console.error('Failed to add column tenantId:', e.message)
      process.exit(1)
    })
  } else {
    console.log(`Column tenantId already exists on ${userTable}`)
  }

  // Ensure index on tenantId
  const idxName = `${userTable}_tenantId_idx`
  await run(
    'select 1 from pg_indexes where schemaname = current_schema() and indexname = $1',
    idxName
  ).then(async (rows) => {
    if (!rows || !rows.length) {
      console.log('Creating index on tenantId...')
      await run(`create index "${idxName}" on "${userTable}" ("tenantId")`).catch((e) => {
        console.warn('Index creation failed (may already exist):', e.message)
      })
    } else {
      console.log('Index already present')
    }
  }).catch(() => {})

  // Ensure FK to xase_tenants(id)
  const fkName = `${userTable}_tenantId_fkey`
  const fkExists = await run(
    `select constraint_name from information_schema.table_constraints where table_schema = current_schema() and table_name = $1 and constraint_type = 'FOREIGN KEY'`,
    userTable
  ).then(rows => rows && rows.some(r => (r.constraint_name || '').includes('tenantid'))).catch(() => false)

  // Check tenant table exists
  const tenantTable = 'xase_tenants'
  const tenantExists = await run(
    'select table_name from information_schema.tables where table_schema = current_schema() and table_name = $1',
    tenantTable
  ).then(rows => !!(rows && rows.length)).catch(() => false)

  if (tenantExists && !fkExists) {
    console.log('Creating foreign key to xase_tenants(id)...')
    await run(
      `alter table "${userTable}" add constraint "${fkName}" foreign key ("tenantId") references "${tenantTable}"("id") on delete set null`
    ).catch((e) => {
      console.warn('FK creation failed (may already exist):', e.message)
    })
  } else if (!tenantExists) {
    console.warn('Tenant table not found; skipping FK creation.')
  } else {
    console.log('FK already present')
  }

  console.log('Done.')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
