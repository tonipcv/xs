#!/usr/bin/env node
'use strict'

/**
 * XASE CORE - Complete Migration Script
 * 
 * Executa todas as migrations SQL necessárias em ordem correta
 * Lida com dependências e garante idempotência
 * 
 * Uso:
 *   DATABASE_URL="postgres://..." node scripts/migrate-xase-complete.js
 */

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL is not set in environment')
    console.error('   Usage: DATABASE_URL="postgres://..." node scripts/migrate-xase-complete.js')
    process.exit(1)
  }

  let pg
  try {
    pg = require('pg')
  } catch (e) {
    console.error('❌ ERROR: Missing dependency "pg". Install it with:')
    console.error('   npm i pg')
    process.exit(1)
  }

  const { Client } = pg
  const client = new Client({ connectionString: process.env.DATABASE_URL })

  console.log('🚀 XASE Core - Complete Migration')
  console.log('==================================\n')
  console.log('Connecting to database...')
  
  await client.connect()
  console.log('✅ Connected\n')

  try {
    await client.query("SET statement_timeout TO '120s'")

    // ========================================
    // STEP 1: Create xase_policies table
    // ========================================
    console.log('📋 [1/6] Creating xase_policies table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.xase_policies (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        policy_id       TEXT NOT NULL,
        version         TEXT NOT NULL,
        document        TEXT NOT NULL,
        document_hash   TEXT NOT NULL,
        name            TEXT NULL,
        description     TEXT NULL,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        activated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        deactivated_at  TIMESTAMPTZ NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
    console.log('   ✓ xase_policies created\n')

    // ========================================
    // STEP 2: Add indexes to xase_policies
    // ========================================
    console.log('📊 [2/6] Creating indexes on xase_policies...')
    await client.query(`CREATE INDEX IF NOT EXISTS xase_policies_tenant_idx ON public.xase_policies (tenant_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS xase_policies_policy_idx ON public.xase_policies (policy_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS xase_policies_active_idx ON public.xase_policies (is_active);`)
    console.log('   ✓ Indexes created\n')

    // ========================================
    // STEP 3: Add legal-grade columns to xase_decision_records
    // ========================================
    console.log('🔧 [3/6] Adding legal-grade columns to xase_decision_records...')
    await client.query(`
      ALTER TABLE public.xase_decision_records
        ADD COLUMN IF NOT EXISTS policy_hash         TEXT NULL,
        ADD COLUMN IF NOT EXISTS model_id            TEXT NULL,
        ADD COLUMN IF NOT EXISTS model_version       TEXT NULL,
        ADD COLUMN IF NOT EXISTS model_hash          TEXT NULL,
        ADD COLUMN IF NOT EXISTS feature_schema_hash TEXT NULL,
        ADD COLUMN IF NOT EXISTS explanation_json    TEXT NULL;
    `)
    console.log('   ✓ Columns added\n')

    console.log('📊 [3.1/6] Creating indexes on decision_records...')
    await client.query(`CREATE INDEX IF NOT EXISTS xase_decision_records_model_idx ON public.xase_decision_records (model_id, model_version);`)
    await client.query(`CREATE INDEX IF NOT EXISTS xase_decision_records_policy_hash_idx ON public.xase_decision_records (policy_hash);`)
    console.log('   ✓ Indexes created\n')

    // ========================================
    // STEP 4: Create xase_evidence_bundles table
    // ========================================
    console.log('📦 [4/6] Creating xase_evidence_bundles table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.xase_evidence_bundles (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        record_id       TEXT NOT NULL,
        bundle_id       TEXT NOT NULL,
        transaction_id  TEXT NOT NULL,
        storage_url     TEXT NULL,
        storage_key     TEXT NULL,
        bundle_hash     TEXT NOT NULL,
        bundle_size     INTEGER NULL,
        format          TEXT NOT NULL DEFAULT 'zip',
        includes_pdf    BOOLEAN NOT NULL DEFAULT FALSE,
        includes_payloads BOOLEAN NOT NULL DEFAULT TRUE,
        retention_until TIMESTAMPTZ NULL,
        legal_hold      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        accessed_at     TIMESTAMPTZ NULL
      );
    `)
    console.log('   ✓ xase_evidence_bundles created\n')

    console.log('📊 [4.1/6] Creating indexes on evidence_bundles...')
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS xase_evidence_bundles_bundle_id_key ON public.xase_evidence_bundles (bundle_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS xase_evidence_bundles_tenant_idx ON public.xase_evidence_bundles (tenant_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS xase_evidence_bundles_record_idx ON public.xase_evidence_bundles (record_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS xase_evidence_bundles_txn_idx ON public.xase_evidence_bundles (transaction_id);`)
    console.log('   ✓ Indexes created\n')

    // ========================================
    // STEP 5: Add constraints (unique, FK)
    // ========================================
    console.log('🔒 [5/6] Adding constraints...')
    
    // Unique constraint on policies
    const uniqueExists = await client.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'xase_policies_tenant_policy_version_key';
    `)
    if (uniqueExists.rows.length === 0) {
      await client.query(`
        ALTER TABLE public.xase_policies
          ADD CONSTRAINT xase_policies_tenant_policy_version_key UNIQUE (tenant_id, policy_id, version);
      `)
      console.log('   ✓ Unique constraint added to xase_policies')
    } else {
      console.log('   ⊙ Unique constraint already exists on xase_policies')
    }

    // FK: evidence_bundles -> tenants
    const fkTenantExists = await client.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'xase_evidence_bundles_tenant_fk';
    `)
    if (fkTenantExists.rows.length === 0) {
      await client.query(`
        ALTER TABLE public.xase_evidence_bundles
          ADD CONSTRAINT xase_evidence_bundles_tenant_fk
          FOREIGN KEY (tenant_id) REFERENCES public.xase_tenants (id) ON DELETE CASCADE;
      `)
      console.log('   ✓ FK tenant added to xase_evidence_bundles')
    } else {
      console.log('   ⊙ FK tenant already exists on xase_evidence_bundles')
    }

    // FK: evidence_bundles -> decision_records
    const fkRecordExists = await client.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'xase_evidence_bundles_record_fk';
    `)
    if (fkRecordExists.rows.length === 0) {
      await client.query(`
        ALTER TABLE public.xase_evidence_bundles
          ADD CONSTRAINT xase_evidence_bundles_record_fk
          FOREIGN KEY (record_id) REFERENCES public.xase_decision_records (id) ON DELETE CASCADE;
      `)
      console.log('   ✓ FK record added to xase_evidence_bundles')
    } else {
      console.log('   ⊙ FK record already exists on xase_evidence_bundles')
    }

    console.log('')

    // ========================================
    // STEP 6: Create trigger function for updated_at
    // ========================================
    console.log('⚙️  [6/6] Creating trigger function for updated_at...')
    const funcExists = await client.query(`
      SELECT 1 FROM pg_proc WHERE proname = 'xase_touch_updated_at';
    `)
    if (funcExists.rows.length === 0) {
      await client.query(`
        CREATE OR REPLACE FUNCTION public.xase_touch_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `)
      console.log('   ✓ Function xase_touch_updated_at created')
    } else {
      console.log('   ⊙ Function xase_touch_updated_at already exists')
    }

    const triggerExists = await client.query(`
      SELECT 1 FROM pg_trigger WHERE tgname = 'xase_policies_touch_updated_at';
    `)
    if (triggerExists.rows.length === 0) {
      await client.query(`
        CREATE TRIGGER xase_policies_touch_updated_at
        BEFORE UPDATE ON public.xase_policies
        FOR EACH ROW EXECUTE FUNCTION public.xase_touch_updated_at();
      `)
      console.log('   ✓ Trigger attached to xase_policies')
    } else {
      console.log('   ⊙ Trigger already exists on xase_policies')
    }

    console.log('')
    console.log('✅ All migrations completed successfully!')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Run: npx prisma generate')
    console.log('  2. Restart your Next.js server')
    console.log('  3. Test export with policy/model metadata')
    console.log('')

  } catch (e) {
    console.error('\n❌ Migration failed:', e.message)
    console.error('\nFull error:', e)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e)
  process.exit(1)
})
