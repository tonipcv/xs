#!/usr/bin/env node
/*
  XASE Voice - SQL patcher (idempotent)
  - Adds missing 2FA/OTP columns to users
  - Ensures sessions.session_token exists (rename if needed)
  - Renames xase_credit_ledger.tenant_id -> organization_id when applicable

  Usage:
    node database/patch-auth-and-ledger-columns.js
*/
const { Client } = require('pg')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL in environment')
  process.exit(1)
}

function log(msg, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
  }
  const c = colors[color] || colors.reset
  console.log(`${c}${msg}${colors.reset}`)
}

async function columnExists(client, table, column) {
  const q = {
    text: `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    values: [table, column],
  }
  const r = await client.query(q)
  return r.rows.length > 0
}

async function tableExists(client, table) {
  const q = {
    text: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    values: [table],
  }
  const r = await client.query(q)
  return r.rows.length > 0
}

async function addColumnIfMissing(client, table, column, definition) {
  const exists = await columnExists(client, table, column)
  if (!exists) {
    const sql = `ALTER TABLE "${table}" ADD COLUMN ${definition}`
    await client.query(sql)
    log(`✔ Added column: ${table}.${column}`, 'green')
  } else {
    log(`• Column exists: ${table}.${column}`, 'cyan')
  }
}

async function renameColumnIf(client, table, fromCol, toCol) {
  const fromExists = await columnExists(client, table, fromCol)
  const toExists = await columnExists(client, table, toCol)
  if (fromExists && !toExists) {
    const sql = `ALTER TABLE "${table}" RENAME COLUMN "${fromCol}" TO "${toCol}"`
    await client.query(sql)
    log(`✔ Renamed column: ${table}.${fromCol} -> ${toCol}`, 'green')
  } else {
    log(`• Rename not needed for ${table}.${fromCol} -> ${toCol}`, 'cyan')
  }
}

async function main() {
  log('\n==============================================')
  log('  XASE VOICE - SQL PATCH (AUTH + LEDGER)', 'yellow')
  log('==============================================\n')

  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  log('✅ Connected to database', 'green')

  try {
    await client.query('BEGIN')

    // 1) Ensure users table exists
    const usersOk = await tableExists(client, 'users')
    if (!usersOk) {
      throw new Error('Table "users" not found. Run the main migration or create auth tables first.')
    }

    // 1a) 2FA/OTP columns on users
    await addColumnIfMissing(client, 'users', 'twoFactorEnabled', '"twoFactorEnabled" BOOLEAN DEFAULT false NOT NULL')
    await addColumnIfMissing(client, 'users', 'totpSecret', '"totpSecret" TEXT')
    await addColumnIfMissing(client, 'users', 'twoFactorVerifiedAt', '"twoFactorVerifiedAt" TIMESTAMP')
    await addColumnIfMissing(client, 'users', 'twoFactorBackupCodes', '"twoFactorBackupCodes" TEXT')
    await addColumnIfMissing(client, 'users', 'emailOtpCode', '"emailOtpCode" TEXT')
    await addColumnIfMissing(client, 'users', 'emailOtpExpires', '"emailOtpExpires" TIMESTAMP')
    // 1b) Optional linking to tenant and role
    await addColumnIfMissing(client, 'users', 'tenantId', '"tenantId" TEXT')
    await addColumnIfMissing(client, 'users', 'xaseRole', '"xaseRole" TEXT')

    // 2) Ensure sessions has session_token
    const sessionsOk = await tableExists(client, 'sessions')
    if (sessionsOk) {
      const hasSessionToken = await columnExists(client, 'sessions', 'session_token')
      if (!hasSessionToken) {
        // try rename from a common alternative name
        await renameColumnIf(client, 'sessions', 'token', 'session_token')
        // if still missing, add fresh column (NOT NULL cannot be enforced if rows exist without value)
        const stillMissing = !(await columnExists(client, 'sessions', 'session_token'))
        if (stillMissing) {
          await client.query('ALTER TABLE "sessions" ADD COLUMN "session_token" TEXT UNIQUE')
          log('✔ Added column: sessions.session_token', 'green')
        }
      } else {
        log('• Column exists: sessions.session_token', 'cyan')
      }
    }

    // 3) Ledger: tenant_id -> organization_id
    const ledgerOk = await tableExists(client, 'xase_credit_ledger')
    if (ledgerOk) {
      const hasOrg = await columnExists(client, 'xase_credit_ledger', 'organization_id')
      const hasTenant = await columnExists(client, 'xase_credit_ledger', 'tenant_id')
      if (!hasOrg && hasTenant) {
        await client.query('ALTER TABLE "xase_credit_ledger" RENAME COLUMN "tenant_id" TO "organization_id"')
        log('✔ Renamed xase_credit_ledger.tenant_id -> organization_id', 'green')
      } else {
        log('• Ledger column names already aligned', 'cyan')
      }
    }

    await client.query('COMMIT')
    log('\n✅ Patch completed successfully', 'green')
  } catch (e) {
    await client.query('ROLLBACK')
    log(`\n❌ Patch failed: ${e.message}`, 'red')
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
