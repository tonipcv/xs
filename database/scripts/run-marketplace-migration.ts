/**
 * Run Marketplace Negotiation Migration
 * Executes SQL migration to add marketplace tables
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function runMigration() {
  try {
    console.log('Running marketplace negotiation migration...');

    const sqlPath = path.join(__dirname, '../migrations/add_marketplace_negotiation.sql');
    let sql = fs.readFileSync(sqlPath, 'utf-8');

    // Remove full-line comments
    sql = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    // Split into statements by semicolons that are OUTSIDE $$ ... $$ blocks
    const statements: string[] = [];
    let buffer = '';
    let inDollarBlock = false;
    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      const next2 = sql.slice(i, i + 2);

      // Toggle when encountering $$
      if (next2 === '$$') {
        inDollarBlock = !inDollarBlock;
        buffer += '$$';
        i++;
        continue;
      }

      if (ch === ';' && !inDollarBlock) {
        const stmt = buffer.trim();
        if (stmt.length > 0) statements.push(stmt);
        buffer = '';
      } else {
        buffer += ch;
      }
    }
    const tail = buffer.trim();
    if (tail.length > 0) statements.push(tail);

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 60)}...`);
      await prisma.$executeRawUnsafe(statement);
    }

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
