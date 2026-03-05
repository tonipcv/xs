import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const migrationPath = path.join(__dirname, '../migrations/030_add_preparation_jobs.sql');
    const sql = await fs.readFile(migrationPath, 'utf-8');

    console.log('🚀 Applying preparation_jobs migration...');
    await pool.query(sql);
    console.log('✅ Migration applied successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

applyMigration();
