#!/usr/bin/env tsx
/**
 * AuditLog Doctor - Inspeciona e corrige a tabela xase_audit_logs
 * - Lista colunas, nullability, defaults
 * - Aplica correções idempotentes para garantir inserts consistentes
 * - Valida com um insert de teste
 */
import { Client } from 'pg';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

async function main() {
  const connectionString = env('DATABASE_URL');
  const client = new Client({ connectionString });
  await client.connect();

  const log = (...args: any[]) => console.log('[auditlog-doctor]', ...args);

  try {
    log('Inspecting xase_audit_logs columns...');
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'xase_audit_logs'
      ORDER BY ordinal_position;
    `);
    cols.rows.forEach((r) => log(`- ${r.column_name} :: ${r.data_type} nullable=${r.is_nullable} default=${r.column_default ?? 'NULL'}`));

    // Ensure resource_type default + not null
    log('Ensuring resource_type has default and NOT NULL...');
    await client.query(`
      ALTER TABLE xase_audit_logs ALTER COLUMN resource_type SET DEFAULT 'GENERIC';
      UPDATE xase_audit_logs SET resource_type = 'GENERIC' WHERE resource_type IS NULL;
      ALTER TABLE xase_audit_logs ALTER COLUMN resource_type SET NOT NULL;
    `);

    // Ensure id has a default UUID if missing
    log('Ensuring id has DEFAULT uuid...');
    const idDefault = await client.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='xase_audit_logs' AND column_name='id';
    `);
    const hasDefault = (idDefault.rows[0]?.column_default ?? '').toString().length > 0;
    if (!hasDefault) {
      // Try pgcrypto first, fallback to uuid-ossp
      await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
      await client.query(`ALTER TABLE xase_audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();`);
    }

    // Test insert using minimal safe set
    log('Performing test insert...');
    const test = await client.query(
      `INSERT INTO xase_audit_logs (action, resource_type, status, timestamp)
       VALUES ($1, $2, $3, NOW()) RETURNING id;`,
      ['DOCTOR_TEST', 'GENERIC', 'SUCCESS']
    );
    log('Test insert id=', test.rows[0].id);

    // Cleanup test
    await client.query(`DELETE FROM xase_audit_logs WHERE id = $1;`, [test.rows[0].id]);
    log('Cleanup done.');

    console.log('\n✅ AuditLog Doctor completed successfully');
  } catch (e: any) {
    console.error('\n❌ AuditLog Doctor error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
