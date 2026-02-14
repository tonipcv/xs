#!/usr/bin/env node
/**
 * Patch: Ensure critical columns exist on public.users used by the app
 * Idempotent: safe to run multiple times
 *
 * Usage:
 *   DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=disable" node database/patch-users-columns.js
 */

const { Client } = require('pg')

async function ensureColumn(client, table, column, typeSQL, defaultSQL = null) {
  // Check column existence
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  )
  if (rows.length) {
    console.log(`✓ ${table}.${column} exists`)
    return
  }
  // Add column
  const defaultClause = defaultSQL ? ` DEFAULT ${defaultSQL}` : ''
  const sql = `ALTER TABLE ${table} ADD COLUMN "${column}" ${typeSQL}${defaultClause};`
  await client.query(sql)
  console.log(`+ Added ${table}.${column} ${typeSQL}${defaultSQL ? ` DEFAULT ${defaultSQL}` : ''}`)
}

async function run() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set. Example: DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=disable" node database/patch-users-columns.js')
    process.exit(1)
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  console.log('Connected to database')

  try {
    // Ensure users table exists
    const { rows: userTable } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users'`
    )
    if (!userTable.length) {
      throw new Error('Table public.users not found')
    }

    console.log('Patching public.users columns...')

    // Auth and profile related
    await ensureColumn(client, 'users', 'password', 'text')
    await ensureColumn(client, 'users', 'image', 'text')
    await ensureColumn(client, 'users', 'region', 'text', `'OTHER'`)

    // OTP / 2FA (even if feature disabled, keep columns to avoid runtime errors)
    await ensureColumn(client, 'users', 'twoFactorEnabled', 'boolean', 'false')
    await ensureColumn(client, 'users', 'totpSecret', 'text')
    await ensureColumn(client, 'users', 'emailOtpCode', 'text')
    await ensureColumn(client, 'users', 'emailOtpExpires', 'timestamptz')

    // Multitenancy linkage
    await ensureColumn(client, 'users', 'tenantId', 'text')
    await ensureColumn(client, 'users', 'xaseRole', 'text')

    // Index for tenantId
    await client.query('CREATE INDEX IF NOT EXISTS users_tenant_idx ON users("tenantId");')

    // Optional FK to xase_tenants (Postgres doesn't support IF NOT EXISTS for constraints reliably)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='xase_tenants'
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

    console.log('Users columns patch done.')

    // Sessions table: ensure session_token exists with correct name
    const { rows: sessionTable } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sessions'`
    )
    if (sessionTable.length) {
      const { rows: hasSessionToken } = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='session_token'`
      )
      if (!hasSessionToken.length) {
        // Attempt to find alternative column name and rename
        const { rows: cols } = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions'`
        )
        const candidate = cols.find(r => r.column_name.toLowerCase().includes('session'))?.column_name
        if (candidate && candidate !== 'session_token') {
          await client.query(`ALTER TABLE sessions RENAME COLUMN "${candidate}" TO session_token;`)
          console.log(`Renamed sessions.${candidate} -> session_token`)
        } else {
          await client.query(`ALTER TABLE sessions ADD COLUMN session_token text UNIQUE;`)
          console.log('Added sessions.session_token text UNIQUE')
        }
      } else {
        console.log('✓ sessions.session_token exists')
      }
    }

    console.log('Patch completed successfully.')
  } catch (e) {
    console.error('Patch failed:', e.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
