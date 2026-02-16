#!/usr/bin/env node
/**
 * Apply lease auto-renew migration
 * Adds support for 72h TTL and auto-renewal
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('✗ Migration failed: DATABASE_URL is not set. Please configure your database connection string.');
    process.exit(1);
  }

  // Basic parse to give user quick diagnostics
  try {
    const parsed = new URL(dbUrl);
    console.log(`→ Using database ${parsed.protocol}//${parsed.hostname}:${parsed.port || '(default)'}/${parsed.pathname.replace('/', '')}`);
  } catch (_) {
    console.warn('! Warning: DATABASE_URL is not a valid URL string. Proceeding anyway.');
  }

  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Read migration SQL
    const migrationPath = path.join(__dirname, '../migrations/020_add_lease_auto_renew.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error(`✗ Migration file not found at ${migrationPath}`);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');

    if (process.env.DEBUG_SQL === '1') {
      console.log('--- BEGIN SQL ---');
      console.log(sql);
      console.log('--- END SQL ---');
    }

    console.log('→ Applying migration: 020_add_lease_auto_renew.sql');
    
    // Execute migration
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('✓ Migration applied successfully');
    
    // Verify columns were added
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'xase_voice_access_leases'
      AND column_name IN ('ttl_seconds', 'auto_renew', 'max_renewals', 'budget_limit')
      ORDER BY column_name;
    `);
    
    console.log('\n✓ New columns added:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
  } catch (error) {
    // Print as much context as possible
    console.error('✗ Migration failed:');
    if (error && error.message) console.error('message:', error.message);
    if (error && error.code) console.error('code   :', error.code);
    if (error && error.detail) console.error('detail :', error.detail);
    if (error && error.hint) console.error('hint   :', error.hint);
    if (error && error.position) console.error('pos    :', error.position);
    console.error('stack  :', error && error.stack ? error.stack : '(no stack)');
    try { await client.query('ROLLBACK'); } catch (_) {}
    process.exit(1);
  } finally {
    try { await client.end(); } catch (_) {}
  }
}

applyMigration();
