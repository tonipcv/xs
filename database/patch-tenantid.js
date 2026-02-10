#!/usr/bin/env node
/**
 * Patch: Ensure users.tenantId column exists (with optional FK and index)
 * Usage:
 *   DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=disable" node database/patch-tenantid.js
 */

const { Client } = require('pg')

async function run() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set. Example: DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=disable" node database/patch-tenantid.js')
    process.exit(1)
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  console.log('Connected to database')

  try {
    // 1) Add column if missing
    console.log('Ensuring users.tenantId column...')
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "tenantId" text;')

    // 2) Add FK to xase_tenants(id) if table exists (idempotent)
    console.log('Ensuring users -> xase_tenants foreign key (if tenants table exists)...')
    await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'xase_tenants'
      ) THEN
        BEGIN
          ALTER TABLE users
          ADD CONSTRAINT users_tenant_fkey
          FOREIGN KEY ("tenantId") REFERENCES xase_tenants(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN
          -- constraint already exists
          NULL;
        END;
      END IF;
    END $$;
    `)

    // 3) Add index for tenantId lookups
    console.log('Ensuring index users_tenant_idx on users("tenantId")...')
    await client.query('CREATE INDEX IF NOT EXISTS users_tenant_idx ON users("tenantId");')

    console.log('Patch completed successfully.')
  } catch (e) {
    console.error('Patch failed:', e.message)
    throw e
  } finally {
    await client.end()
  }
}

run().catch(() => process.exit(1))
