/* eslint-disable no-console */
// Run: node scripts/run_sql_migration.js
// Requires: npm i pg
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

function buildClientFromEnv() {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new Error('DATABASE_URL not set');

  // Basic handling for sslmode=disable in URL
  // pg doesn't parse sslmode param automatically; map it to ssl option
  const url = new URL(connStr);
  const sslmode = url.searchParams.get('sslmode');
  const ssl = sslmode ? (sslmode !== 'disable') : undefined;

  return new pg.Client({ connectionString: connStr, ssl });
}

async function main() {
  const sqlPath = path.join(process.cwd(), 'scripts', 'migrate_pricing_use_case.sql');
  if (!fs.existsSync(sqlPath)) throw new Error('SQL file not found: ' + sqlPath);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = buildClientFromEnv();
  try {
    await client.connect();
    console.log('Connected to database');
    await client.query(sql);
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
