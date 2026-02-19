#!/usr/bin/env tsx
/**
 * Execute migration 007: Create ROPARecord table
 * Idempotent SQL execution using pg driver
 */

import { Client } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'

async function runMigration() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set')
    process.exit(1)
  }

  const client = new Client({ connectionString })

  try {
    await client.connect()
    console.log('✅ Connected to database')

    const sqlPath = join(__dirname, '../migrations/007_create_ropa_record.sql')
    const sql = readFileSync(sqlPath, 'utf-8')

    console.log('🔄 Executing migration 007_create_ropa_record.sql...')
    await client.query(sql)
    console.log('✅ Migration 007 executed successfully')

    // Verify table exists
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'xase_ropa_records'
    `)

    if (result.rows.length > 0) {
      console.log('✅ Table xase_ropa_records verified')
    } else {
      console.error('❌ Table xase_ropa_records not found after migration')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
