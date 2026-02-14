/**
 * Run a single SQL migration file
 * Usage: node database/run-single-migration.js <migration-file.sql>
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSingleMigration() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('❌ Usage: node run-single-migration.js <migration-file.sql>');
    process.exit(1);
  }

  const migrationPath = path.join(__dirname, 'migrations', migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    console.log(`\n🚀 Running migration: ${migrationFile}`);
    console.log('=====================================\n');

    await client.connect();
    console.log('✅ Connected to database');

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log(`📄 Executing SQL (${sql.length} bytes)...\n`);

    await client.query(sql);
    
    console.log('\n✅ Migration executed successfully!');
    console.log('=====================================\n');

  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSingleMigration();
