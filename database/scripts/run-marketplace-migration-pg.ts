/**
 * Run Marketplace Negotiation Migration using pg client
 * Executes the SQL file as a single multi-statement script.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, '../migrations/add_marketplace_negotiation.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  const client = new Client({ connectionString: databaseUrl });
  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Running migration (pg simple query mode)...');
    // Use simple query protocol which supports multiple statements
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('✅ Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
