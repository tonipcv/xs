#!/usr/bin/env node
'use strict'

/**
 * Run a SQL file against your Postgres using DATABASE_URL
 *
 * Usage:
 *   node scripts/run-sql.js prisma/sql/20251216_xase_manual.sql
 *
 * Requirements:
 *   - env DATABASE_URL set (postgres connection string)
 *   - dependency: pg (install with `npm i pg`)
 */

const fs = require('fs')
const path = require('path')

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node scripts/run-sql.js <path/to/file.sql>')
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set in environment')
    process.exit(1)
  }

  let sql
  try {
    sql = fs.readFileSync(path.resolve(file), 'utf8')
  } catch (e) {
    console.error('ERROR: Failed to read SQL file:', e.message)
    process.exit(1)
  }

  let pg
  try {
    pg = require('pg')
  } catch (e) {
    console.error('ERROR: Missing dependency "pg". Install it with:')
    console.error('  npm i pg')
    process.exit(1)
  }

  const { Client } = pg
  const client = new Client({ connectionString: process.env.DATABASE_URL })

  console.log('Connecting to database...')
  await client.connect()

  try {
    // Optional: shorter statement_timeout (ms) to avoid hangs
    await client.query("SET statement_timeout TO '120s'")

    console.log(`Executing SQL from ${file}...`)

    // Split SQL into statements safely handling $$ ... $$ blocks
    const statements = []
    let buf = ''
    let inSingle = false
    let inDouble = false
    let inDollar = false
    let i = 0
    while (i < sql.length) {
      const ch = sql[i]
      const next2 = sql.slice(i, i + 2)
      if (!inSingle && !inDouble && next2 === '$$') {
        inDollar = !inDollar
        buf += next2
        i += 2
        continue
      }
      if (!inDollar) {
        if (!inDouble && ch === "'" && sql[i - 1] !== '\\') inSingle = !inSingle
        if (!inSingle && ch === '"' && sql[i - 1] !== '\\') inDouble = !inDouble
      }
      if (!inSingle && !inDouble && !inDollar && ch === ';') {
        const stmt = buf.trim()
        if (stmt.length > 0 && !stmt.startsWith('--')) statements.push(stmt)
        buf = ''
        i += 1
        continue
      }
      buf += ch
      i += 1
    }
    const finalStmt = buf.trim()
    if (finalStmt) statements.push(finalStmt)

    // Prioritize CREATE TABLE statements first
    const prioritized = [
      ...statements.filter(s => /^CREATE\s+TABLE/i.test(s)),
      ...statements.filter(s => !/^CREATE\s+TABLE/i.test(s))
    ]

    for (const [idx, stmt] of prioritized.entries()) {
      // Skip pure comments
      if (/^--/.test(stmt)) continue
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 120)
      console.log(`→ [${idx + 1}/${prioritized.length}] ${preview}...`)
      try {
        await client.query(stmt)
      } catch (e) {
        console.error(`❌ Failed at statement ${idx + 1}:`, e.message)
        throw e
      }
    }

    console.log('✅ SQL executed successfully')
  } catch (e) {
    console.error('❌ SQL execution failed:', e.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e)
  process.exit(1)
})
