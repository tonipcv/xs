#!/usr/bin/env tsx
/**
 * Apply preparation pipeline database migrations
 * Runs migrations 031, 032, 033 in sequence
 */

import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const migrations = [
  '031_add_preparation_spec_columns.sql',
  '032_add_preparation_delivery_columns.sql',
  '033_add_preparation_result_columns.sql',
];

async function applyMigrations() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('🔄 Connecting to database...');
    await pool.query('SELECT 1');
    console.log('✅ Connected to database');

    for (const migration of migrations) {
      const migrationPath = path.join(process.cwd(), 'database', 'migrations', migration);
      
      console.log(`\n📄 Reading migration: ${migration}`);
      const sql = await fs.readFile(migrationPath, 'utf-8');

      console.log(`🔄 Applying migration: ${migration}`);
      await pool.query(sql);
      console.log(`✅ Applied migration: ${migration}`);
    }

    console.log('\n✅ All migrations applied successfully!');
    console.log('\n📊 Verifying schema...');

    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'preparation_jobs' 
      AND column_name IN (
        'license', 'privacy', 'output_contract',
        'manifest_path', 'checksum_path', 'readme_path', 'download_urls', 'delivery_expires_at',
        'normalization_result', 'compilation_result', 'delivery_result'
      )
      ORDER BY column_name;
    `);

    console.log('\n📋 New columns in preparation_jobs:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n🎉 Migration complete! Run `npx prisma generate` to update Prisma client.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigrations();
