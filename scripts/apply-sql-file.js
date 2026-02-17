/**
 * Apply a single SQL file to Postgres (idempotent, safe to re-run)
 * Usage: node scripts/apply-sql-file.js path/to/file.sql
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

(async () => {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node scripts/apply-sql-file.js path/to/file.sql');
    process.exit(1);
  }
  const sqlPath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!fs.existsSync(sqlPath)) {
    console.error(`SQL file not found: ${sqlPath}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    console.log(`\n🚀 Applying SQL file: ${sqlPath}`);
    await client.connect();
    // Execute as a single batch; statements inside are idempotent (IF NOT EXISTS / DO $$ checks)
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ SQL applied successfully');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ Error applying SQL:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
