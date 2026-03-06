#!/usr/bin/env node
import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

async function applyMigration() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    console.log('🚀 Applying PreparationSpec migration...');
    
    const migrationPath = path.join(
      process.cwd(),
      'database/migrations/031_add_preparation_spec_columns.sql'
    );
    
    const sql = await fs.readFile(migrationPath, 'utf-8');
    
    await pool.query(sql);
    
    console.log('✅ Migration applied successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

applyMigration().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
