#!/usr/bin/env tsx
/**
 * Apply billing_snapshots migration
 * Run: npx tsx database/scripts/apply-billing-snapshot-migration.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

async function applyMigration() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    console.log('📦 Applying billing_snapshots migration...');
    
    const migrationPath = path.join(__dirname, '../migrations/027_add_billing_snapshots.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    await pool.query(sql);
    
    console.log('✅ Migration applied successfully');
    console.log('🔄 Run: npx prisma generate');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
