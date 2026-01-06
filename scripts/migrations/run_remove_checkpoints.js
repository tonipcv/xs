#!/usr/bin/env node
/*
 * XASE Migration Runner: Remove Checkpoints
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host:5432/db node scripts/migrations/run_remove_checkpoints.js
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[ERROR] DATABASE_URL env var is required')
    process.exit(1)
  }

  const sqlPath = path.resolve(__dirname, './20260105_remove_checkpoints.sql')
  if (!fs.existsSync(sqlPath)) {
    console.error(`[ERROR] SQL file not found: ${sqlPath}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(sqlPath, 'utf8')

  const client = new Client({ connectionString: databaseUrl })
  try {
    await client.connect()
    console.log('[INFO] Connected to database')

    console.log('[INFO] Running migration: remove checkpoints...')
    await client.query(sql)

    console.log('[SUCCESS] Migration completed: xase_checkpoint_records dropped (if existed)')
    process.exit(0)
  } catch (err) {
    console.error('[ERROR] Migration failed:', err.message)
    process.exit(1)
  } finally {
    await client.end().catch(() => {})
  }
}

main()
