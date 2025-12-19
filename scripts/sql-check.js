#!/usr/bin/env node
'use strict'

// Deep SQL diagnostics (PostgreSQL) using Prisma's raw SQL
// - Confirms connection target (db, user, host, port, schema, search_path)
// - Lists XASE tables (xase_*) existence and row counts
// - Shows User table columns and presence of tenantId

async function main() {
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  const url = process.env.DATABASE_URL || ''
  const masked = url ? url.replace(/:\/\/([^:@]+):?([^@]*)@/, '://***:***@') : '(not set)'

  const run = async (sql, ...params) => {
    try {
      return await prisma.$queryRawUnsafe(sql, ...params)
    } catch (e) {
      return { __error: e.message }
    }
  }

  const meta = {}
  meta.database_url = masked
  meta.current_database = await run('select current_database() as db')
  meta.current_user = await run('select current_user as usr')
  meta.current_schema = await run('select current_schema() as sch')
  meta.version = await run('select version()')
  meta.server = await run('select inet_server_addr() as host, inet_server_port() as port')
  meta.search_path = await run('show search_path')

  const listXase = await run(
    "select table_name from information_schema.tables where table_schema = current_schema() and table_name like 'xase_%' order by table_name"
  )

  const expected = ['xase_tenants','xase_api_keys','xase_decision_records','xase_checkpoint_records','xase_audit_logs']
  const details = {}
  for (const t of expected) {
    const exists = await run(
      'select table_name from information_schema.tables where table_schema = current_schema() and table_name = $1',
      t
    )
    if (Array.isArray(exists) && exists.length) {
      const cols = await run(
        'select column_name, data_type from information_schema.columns where table_schema = current_schema() and table_name = $1 order by ordinal_position',
        t
      )
      const count = await run(`select count(*)::bigint as count from "${t}"`)
      details[t] = { exists: true, columns: cols, count }
    } else {
      details[t] = { exists: false }
    }
  }

  // User table inspection
  const userCandidates = ['User','user','users']
  let userTable = null
  for (const t of userCandidates) {
    const rows = await run(
      'select table_name from information_schema.tables where table_schema = current_schema() and table_name = $1',
      t
    )
    if (Array.isArray(rows) && rows.length) { userTable = t; break }
  }
  let userInfo = { table: userTable }
  if (userTable) {
    const cols = await run(
      'select column_name, data_type from information_schema.columns where table_schema = current_schema() and table_name = $1 order by ordinal_position',
      userTable
    )
    const hasTenantId = Array.isArray(cols) && cols.some(r => r.column_name === 'tenantId')
    userInfo.columns = cols
    userInfo.hasTenantId = !!hasTenantId
  }

  const out = {
    meta,
    xase: { list: listXase, details },
    user: userInfo,
  }

  // BigInt-safe stringify
  const replacer = (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
  console.log(JSON.stringify(out, replacer, 2))
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
