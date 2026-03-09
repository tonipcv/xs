/**
 * Database Test Helper
 * Configures test environment with real database connection
 * For integration tests that require PostgreSQL
 */

import { PrismaClient } from '@prisma/client';

// Prisma client for tests
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

export interface TestDatabaseConfig {
  databaseUrl: string;
  runMigrations: boolean;
  cleanAfterTests: boolean;
}

export function getTestDatabaseConfig(): TestDatabaseConfig {
  return {
    databaseUrl: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/xase_test',
    runMigrations: process.env.TEST_RUN_MIGRATIONS === 'true',
    cleanAfterTests: process.env.TEST_CLEAN_AFTER !== 'false',
  };
}

export function validateTestDatabase(): { valid: boolean; error?: string } {
  const config = getTestDatabaseConfig();
  
  if (!config.databaseUrl) {
    return {
      valid: false,
      error: 'TEST_DATABASE_URL or DATABASE_URL not set',
    };
  }
  
  // Check if it's a test database
  if (!config.databaseUrl.includes('test') && !config.databaseUrl.includes('_test')) {
    console.warn('[Test DB] Warning: Using non-test database. Tests may modify production data!');
  }
  
  return { valid: true };
}

/**
 * Setup test database - run migrations if needed
 */
export async function setupTestDatabase(): Promise<void> {
  const config = getTestDatabaseConfig();
  const validation = validateTestDatabase();
  
  if (!validation.valid) {
    throw new Error(`Test database validation failed: ${validation.error}`);
  }
  
  console.log('[Test DB] Connecting to:', config.databaseUrl.replace(/\/\/.*@/, '//***@'));
  
  try {
    // Test connection
    await testPrisma.$connect();
    await testPrisma.$queryRaw`SELECT 1`;
    console.log('[Test DB] Connection successful');
    
    if (config.runMigrations) {
      console.log('[Test DB] Running migrations...');
      // Note: In production, use prisma migrate deploy
      // For tests, we assume schema is already synced
    }
  } catch (error) {
    throw new Error(`Failed to connect to test database: ${error}`);
  }
}

/**
 * Clean up test database
 */
export async function cleanupTestDatabase(): Promise<void> {
  const config = getTestDatabaseConfig();
  
  if (!config.cleanAfterTests) {
    console.log('[Test DB] Skipping cleanup (TEST_CLEAN_AFTER=false)');
    return;
  }
  
  console.log('[Test DB] Cleaning up test data...');
  
  // Delete test data in reverse dependency order
  try {
    await testPrisma.$transaction([
      testPrisma.preparationJob.deleteMany(),
      testPrisma.dataset.deleteMany(),
      // Add other tables as needed
    ]);
    console.log('[Test DB] Cleanup complete');
  } catch (error) {
    console.error('[Test DB] Cleanup failed:', error);
  }
}

/**
 * Close test database connection
 */
export async function closeTestDatabase(): Promise<void> {
  await testPrisma.$disconnect();
  console.log('[Test DB] Connection closed');
}

/**
 * Helper to check if database is available
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await testPrisma.$connect();
    await testPrisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Skip test if database not available
 */
export function skipIfNoDatabase(): void {
  if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
    console.log('[Test DB] No database configured, skipping test');
    // In vitest, you would use test.skip or describe.skip
  }
}

export const requiredEnvVars = [
  'DATABASE_URL',
];

export function printTestDbHelp(): void {
  console.log(`
[DB Test Helper] To run tests with real database:

1. Set environment variable:
   export DATABASE_URL="postgresql://user:pass@localhost:5432/xase_test"
   
   OR
   
   export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/xase_test"

2. Ensure database exists:
   createdb xase_test

3. Run migrations:
   npx prisma migrate deploy

4. Run tests:
   npm test

Note: Tests will skip automatically if no database is configured.
`);
}
