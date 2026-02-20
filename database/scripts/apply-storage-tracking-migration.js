/**
 * Apply storage tracking migration
 * Adds storage snapshot tracking and billing fields
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Applying storage tracking migration...');

    const migrationPath = path.join(__dirname, '../migrations/027_add_storage_tracking.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Storage tracking migration applied successfully');
    console.log('📊 Created:');
    console.log('  - xase_storage_snapshots table');
    console.log('  - v_monthly_storage_usage view');
    console.log('  - v_current_storage_by_tenant view');
    console.log('  - calculate_storage_gb_hours() function');
    console.log('  - create_storage_snapshot() function');
    console.log('  - Added storage fields to xase_policy_executions');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

applyMigration().catch(console.error);
