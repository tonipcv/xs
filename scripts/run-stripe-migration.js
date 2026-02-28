const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function runMigration() {
  try {
    console.log('Starting Stripe fields migration...');

    // Read the SQL file
    const sqlPath = path.join(__dirname, '../migrations/add_stripe_fields.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Remove comments and split by semicolons
    const cleanedSql = sqlContent
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    // Split by semicolons but keep CREATE TABLE blocks together
    const statements = [];
    let currentStatement = '';
    let inCreateTable = false;
    
    for (const part of cleanedSql.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      if (trimmed.toUpperCase().includes('CREATE TABLE')) {
        inCreateTable = true;
        currentStatement = trimmed;
      } else if (inCreateTable && trimmed.includes(')')) {
        currentStatement += ';' + trimmed;
        statements.push(currentStatement);
        currentStatement = '';
        inCreateTable = false;
      } else if (inCreateTable) {
        currentStatement += ';' + trimmed;
      } else {
        statements.push(trimmed);
      }
    }
    
    if (currentStatement) {
      statements.push(currentStatement);
    }

    console.log(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement separately
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        await prisma.$executeRawUnsafe(statement);
        console.log(`✓ Statement ${i + 1} executed successfully`);
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42701') {
          console.log(`⚠ Statement ${i + 1} skipped (already exists)`);
        } else {
          console.error(`✗ Statement ${i + 1} failed:`, error.message);
          throw error;
        }
      }
    }

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
