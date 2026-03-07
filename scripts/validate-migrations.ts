/**
 * Migration validation script for PostgreSQL
 * Validates that migrations 030-035 can run cleanly on a real PostgreSQL database
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const migrations = [
  '030_add_preparation_jobs.sql',
  '031_add_preparation_spec_columns.sql',
  '032_add_preparation_delivery_columns.sql',
  '033_add_preparation_result_columns.sql',
  '034_add_idempotency_records.sql',
  '035_add_audit_logs.sql',
  '036_create_job_logs.sql',
];

async function validateMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/xase_test',
  });

  console.log('[Migration Validation] Connecting to PostgreSQL...');
  
  try {
    await client.connect();
    console.log('[Migration Validation] Connected successfully');

    // Test if we can execute a simple query
    const result = await client.query('SELECT version()');
    console.log(`[Migration Validation] PostgreSQL version: ${result.rows[0].version}`);

    // Read and validate each migration
    const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
    
    for (const migration of migrations) {
      const migrationPath = path.join(migrationsDir, migration);
      
      console.log(`\n[Migration Validation] Checking ${migration}...`);
      
      if (!fs.existsSync(migrationPath)) {
        console.error(`[Migration Validation] ERROR: Migration file not found: ${migration}`);
        continue;
      }

      const sql = fs.readFileSync(migrationPath, 'utf-8');
      
      // Check for idempotency markers
      if (!sql.includes('IF NOT EXISTS') && !sql.includes('CREATE TABLE IF NOT EXISTS')) {
        console.warn(`[Migration Validation] WARNING: ${migration} may not be idempotent`);
      }

      // Validate SQL syntax by attempting to run it in a transaction
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('ROLLBACK');
        console.log(`[Migration Validation] ✓ ${migration} - SQL syntax valid`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[Migration Validation] ✗ ${migration} - SQL error:`, error instanceof Error ? error.message : error);
      }
    }

    // Check that all expected tables exist after migrations
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('preparation_jobs', 'idempotency_records', 'audit_logs')
    `);

    const existingTables = tableCheck.rows.map(r => r.table_name);
    console.log(`\n[Migration Validation] Tables found: ${existingTables.join(', ') || 'none'}`);

    const expectedTables = ['preparation_jobs', 'idempotency_records', 'audit_logs'];
    const missingTables = expectedTables.filter(t => !existingTables.includes(t));
    
    if (missingTables.length > 0) {
      console.warn(`[Migration Validation] Missing tables: ${missingTables.join(', ')}`);
    }

    console.log('\n[Migration Validation] Complete!');

  } catch (error) {
    console.error('[Migration Validation] Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run if executed directly
if (require.main === module) {
  validateMigrations();
}

export { validateMigrations };
