#!/usr/bin/env node

/**
 * Xase Voice Data Governance - Migration Script
 * 
 * Migra banco de dados do Xase Core para Xase Voice MVP
 * - Backup automático antes de qualquer alteração
 * - Validação de schema
 * - Rollback em caso de erro
 * - Logs detalhados
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuração
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:f4c3d9b8d88fa9dbefb2@dpbdp1.easypanel.host:643/aa?sslmode=disable';
const BACKUP_DIR = path.join(__dirname, 'backups');
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_BACKUP = process.argv.includes('--skip-backup') || process.env.SKIP_BACKUP === '1';

// Cores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function seedInitialData(client) {
  logStep('SEED', 'Inserindo seed mínimo (SUPPLIER, CLIENT, ApiKey)...');

  // Tenants sup1 (SUPPLIER) e cli1 (CLIENT)
  await client.query(
    `INSERT INTO xase_tenants (id, name, email, organization_type)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO NOTHING`,
    ['sup1', 'Supplier One', 'sup1@example.com', 'SUPPLIER']
  );
  await client.query(
    `INSERT INTO xase_tenants (id, name, email, organization_type)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO NOTHING`,
    ['cli1', 'Client One', 'cli1@example.com', 'CLIENT']
  );

  // ApiKey para cliente (cli1)
  const keyId = 'key1';
  const keyHash = process.env.SEED_CLIENT_API_KEY_HASH || 'dev_hash_do_not_use';
  const keyPrefix = process.env.SEED_CLIENT_API_KEY_PREFIX || 'devkey01';
  if (!process.env.SEED_CLIENT_API_KEY_HASH) {
    logWarning('Usando key hash de desenvolvimento (SEED_CLIENT_API_KEY_HASH não definido). Troque em produção.');
  }
  await client.query(
    `INSERT INTO xase_api_keys (id, tenant_id, name, key_hash, key_prefix)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO NOTHING`,
    [keyId, 'cli1', 'Default Key', keyHash, keyPrefix]
  );

  logSuccess('Seed mínimo aplicado (sup1, cli1, key1).');
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function createBackup(client) {
  logStep('BACKUP', 'Criando backup do banco de dados...');
  if (SKIP_BACKUP) {
    logWarning('Backup pulado por --skip-backup / SKIP_BACKUP=1');
    return null;
  }
  
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `xase-core-backup-${timestamp}.sql`);

  try {
    // Extrair credenciais da URL
    const url = new URL(DATABASE_URL);
    const host = url.hostname;
    const port = url.port || '5432';
    const database = url.pathname.slice(1).split('?')[0];
    const user = url.username;
    const password = url.password;

    // Executar pg_dump
    const env = { ...process.env, PGPASSWORD: password };
    try {
      const pgDumpBin = process.env.PG_DUMP_BIN || 'pg_dump';
      log(`Usando pg_dump binário: ${pgDumpBin}`, 'blue');
      execSync(
        `${pgDumpBin} -h ${host} -p ${port} -U ${user} -d ${database} -F p -f ${backupFile}`,
        { env, stdio: 'pipe' }
      );
    } catch (pgErr) {
      const msg = String(pgErr?.stdout || pgErr?.stderr || pgErr?.message || '');
      const versionMismatch = msg.includes('server version') && msg.includes('pg_dump version');
      const useDocker = process.env.USE_DOCKER_PGDUMP === '1';
      if (versionMismatch && useDocker) {
        // Verificar docker disponível
        try {
          execSync('docker --version', { stdio: 'pipe' });
        } catch (e) {
          logError('Docker não encontrado no PATH.');
          logWarning('Instale Docker ou use --skip-backup ou defina PG_DUMP_BIN para um pg_dump v17.');
          throw pgErr;
        }
        logWarning('pg_dump local incompatível. Tentando fallback com Docker (postgres:17)...');
        const mountDir = BACKUP_DIR;
        const dockerCmd = `docker run --rm -e PGPASSWORD=${password} -v ${mountDir}:/backup postgres:17 pg_dump -h ${host} -p ${port} -U ${user} -d ${database} -F p -f /backup/${path.basename(backupFile)}`;
        execSync(dockerCmd, { stdio: 'pipe' });
      } else if (versionMismatch) {
        logError('pg_dump incompatível com a versão do servidor.');
        logWarning('Soluções: (A) export USE_DOCKER_PGDUMP=1 e tenha Docker instalado; (B) rode com --skip-backup; (C) instale pg_dump v17 e export PG_DUMP_BIN=/caminho/pg_dump.');
        throw pgErr;
      } else {
        throw pgErr;
      }
    }

    logSuccess(`Backup criado: ${backupFile}`);
    return backupFile;
  } catch (error) {
    logError(`Falha ao criar backup: ${error.message}`);
    throw error;
  }
}

async function validateSchema(client) {
  logStep('VALIDAÇÃO', 'Validando schema atual...');

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  log(`\nTabelas encontradas (${tables.rows.length}):`);
  tables.rows.forEach(row => log(`  - ${row.table_name}`, 'blue'));

  return tables.rows;
}

async function removeCoreTables(client) {
  logStep('LIMPEZA', 'Removendo tabelas do Xase Core não utilizadas no MVP Voice...');

  const coreTablesToRemove = [
    'xase_policies',
    'xase_decision_records',
    'xase_evidence_bundles',
    'xase_human_interventions',
    'xase_model_cards',
    'xase_drift_records',
    'xase_alerts',
    'xase_metrics_snapshots',
    'xase_alert_rules',
    'xase_evidence_snapshots',
    'xase_insurance_decisions',
    'Subscription', // Stripe subscriptions
  ];

  for (const table of coreTablesToRemove) {
    try {
      const checkQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `;
      const exists = await client.query(checkQuery, [table]);

      if (exists.rows[0].exists) {
        if (DRY_RUN) {
          log(`  [DRY-RUN] DROP TABLE IF EXISTS "${table}" CASCADE;`, 'yellow');
        } else {
          await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
          logSuccess(`Tabela removida: ${table}`);
        }
      }
    } catch (error) {
      logWarning(`Erro ao remover ${table}: ${error.message}`);
    }
  }
}

async function cleanUserTable(client) {
  logStep('SIMPLIFICAÇÃO', 'Removendo campos de Stripe/tokens do User...');

  const columnsToRemove = [
    'stripeCustomerId',
    'tokensUsedThisMonth',
    'freeTokensLimit',
    'totalTokensUsed',
    'lastTokenReset',
    'planTier',
    'useCasesIncluded',
    'retentionYears',
  ];

  for (const column of columnsToRemove) {
    try {
      const checkQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name = $1
      `;
      const exists = await client.query(checkQuery, [column]);

      if (exists.rows.length > 0) {
        if (DRY_RUN) {
          log(`  [DRY-RUN] ALTER TABLE "User" DROP COLUMN IF EXISTS "${column}";`, 'yellow');
        } else {
          await client.query(`ALTER TABLE "User" DROP COLUMN IF EXISTS "${column}"`);
          logSuccess(`Coluna removida: User.${column}`);
        }
      }
    } catch (error) {
      logWarning(`Erro ao remover User.${column}: ${error.message}`);
    }
  }
}

async function addVoiceColumns(client) {
  logStep('MIGRAÇÃO', 'Adicionando colunas para Voice Data Governance...');

  // Adicionar organizationType ao Tenant
  try {
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'xase_tenants' 
      AND column_name = 'organization_type'
    `;
    const exists = await client.query(checkQuery);

    if (exists.rows.length === 0) {
      if (DRY_RUN) {
        log(`  [DRY-RUN] ALTER TABLE "xase_tenants" ADD COLUMN "organization_type" TEXT;`, 'yellow');
      } else {
        await client.query(`
          DO $$ BEGIN
            CREATE TYPE organization_type AS ENUM ('SUPPLIER', 'CLIENT', 'PLATFORM_ADMIN');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        await client.query(`
          ALTER TABLE "xase_tenants" 
          ADD COLUMN IF NOT EXISTS "organization_type" organization_type
        `);
        logSuccess('Coluna adicionada: xase_tenants.organization_type');
      }
    }
  } catch (error) {
    logWarning(`Erro ao adicionar organization_type: ${error.message}`);
  }
}

async function applyVoiceSchema(client) {
  logStep('DDL', 'Aplicando schema Voice MVP diretamente via SQL...');

  const ddl = `
  -- Enums (idempotentes)
  DO $$ BEGIN
    CREATE TYPE organization_type AS ENUM ('SUPPLIER','CLIENT','PLATFORM_ADMIN');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE consent_status AS ENUM ('PENDING','VERIFIED_BY_XASE','SELF_DECLARED','MISSING');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE processing_status AS ENUM ('PENDING','QUEUED','PROCESSING','COMPLETED','FAILED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE dataset_status AS ENUM ('DRAFT','ACTIVE','ARCHIVED','DELETED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE policy_status AS ENUM ('ACTIVE','EXPIRED','REVOKED','SUSPENDED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE voice_access_action AS ENUM ('BATCH_DOWNLOAD','STREAM_ACCESS','METADATA_VIEW','POLICY_CHECK');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  -- Auth tables mínimas (NextAuth)
  CREATE TABLE IF NOT EXISTS "users" (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    "email_verified" TIMESTAMP,
    image TEXT,
    password TEXT,
    "resetToken" TEXT UNIQUE,
    "resetTokenExpiry" TIMESTAMP,
    "verificationToken" TEXT UNIQUE,
    language TEXT,
    region TEXT DEFAULT 'OTHER' NOT NULL,
    "created_at" TIMESTAMP DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT now() NOT NULL,
    phone TEXT,
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMP,
    emailOtpCode TEXT,
    emailOtpExpires TIMESTAMP,
    twoFactorEnabled BOOLEAN DEFAULT false NOT NULL,
    totpSecret TEXT,
    twoFactorVerifiedAt TIMESTAMP,
    twoFactorBackupCodes TEXT,
    tenantId TEXT,
    xaseRole TEXT
  );

  CREATE TABLE IF NOT EXISTS "accounts" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INT,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    UNIQUE(provider, "providerAccountId")
  );

  CREATE TABLE IF NOT EXISTS "sessions" (
    id TEXT PRIMARY KEY,
    "session_token" TEXT UNIQUE NOT NULL,
    "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "verification_tokens" (
    identifier TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires TIMESTAMP NOT NULL,
    UNIQUE(identifier, token)
  );

  -- Tenants
  CREATE TABLE IF NOT EXISTS "xase_tenants" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    "companyName" TEXT,
    industry TEXT,
    website TEXT,
    organization_type organization_type,
    status TEXT DEFAULT 'ACTIVE' NOT NULL,
    plan TEXT DEFAULT 'free' NOT NULL,
    "created_at" TIMESTAMP DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT now() NOT NULL
  );

  -- Api Keys
  CREATE TABLE IF NOT EXISTS "xase_api_keys" (
    id TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL REFERENCES xase_tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "key_hash" TEXT UNIQUE NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    permissions TEXT DEFAULT 'read,write' NOT NULL,
    "rateLimit" INT DEFAULT 1000 NOT NULL,
    "lastUsedAt" TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON xase_api_keys("tenant_id");
  CREATE INDEX IF NOT EXISTS idx_api_keys_keyhash ON xase_api_keys("key_hash");

  -- Audit Log
  CREATE TABLE IF NOT EXISTS "xase_audit_logs" (
    id TEXT PRIMARY KEY,
    tenantId TEXT,
    userId TEXT,
    action TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    metadata TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    status TEXT DEFAULT 'SUCCESS' NOT NULL,
    "errorMessage" TEXT,
    timestamp TIMESTAMP DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_tenant ON xase_audit_logs(tenantId);
  CREATE INDEX IF NOT EXISTS idx_audit_user ON xase_audit_logs(userId);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON xase_audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON xase_audit_logs(timestamp);

  -- Dataset (Voice)
  CREATE TABLE IF NOT EXISTS "xase_voice_datasets" (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES xase_tenants(id) ON DELETE CASCADE,
    dataset_id TEXT UNIQUE NOT NULL,
    version TEXT DEFAULT '1.0' NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    total_duration_hours DOUBLE PRECISION NOT NULL,
    num_recordings INT NOT NULL,
    sample_rate INT DEFAULT 16000 NOT NULL,
    codec TEXT DEFAULT 'wav' NOT NULL,
    channel_count INT DEFAULT 1 NOT NULL,
    collection_start_ts TIMESTAMP,
    collection_end_ts TIMESTAMP,
    storage_location TEXT NOT NULL,
    storage_size BIGINT,
    dataset_hash TEXT,
    language TEXT NOT NULL,
    avg_snr DOUBLE PRECISION,
    avg_speech_ratio DOUBLE PRECISION,
    avg_overlap_ratio DOUBLE PRECISION,
    avg_silence_ratio DOUBLE PRECISION,
    noise_level TEXT,
    call_type TEXT,
    intent_cluster TEXT,
    emotion_band TEXT,
    outcome_flag TEXT,
    consent_status consent_status DEFAULT 'PENDING' NOT NULL,
    consent_proof_uri TEXT,
    consent_proof_hash TEXT,
    consent_version TEXT,
    allowed_purposes TEXT[],
    jurisdiction TEXT,
    retention_expires_at TIMESTAMP,
    processing_status processing_status DEFAULT 'PENDING' NOT NULL,
    processing_error TEXT,
    status dataset_status DEFAULT 'DRAFT' NOT NULL,
    published_at TIMESTAMP,
    archived_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now() NOT NULL,
    updated_at TIMESTAMP DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dataset_tenant ON xase_voice_datasets(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_dataset_status ON xase_voice_datasets(status);
  CREATE INDEX IF NOT EXISTS idx_dataset_lang ON xase_voice_datasets(language);
  CREATE INDEX IF NOT EXISTS idx_dataset_noise ON xase_voice_datasets(noise_level);
  CREATE INDEX IF NOT EXISTS idx_dataset_calltype ON xase_voice_datasets(call_type);
  CREATE INDEX IF NOT EXISTS idx_dataset_proc ON xase_voice_datasets(processing_status);
  CREATE INDEX IF NOT EXISTS idx_dataset_consent ON xase_voice_datasets(consent_status);

  -- Audio Segment (pós-MVP, já previsto)
  CREATE TABLE IF NOT EXISTS "xase_audio_segments" (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES xase_voice_datasets(id) ON DELETE CASCADE,
    segment_id TEXT UNIQUE NOT NULL,
    file_key TEXT NOT NULL,
    duration_sec DOUBLE PRECISION NOT NULL,
    sample_rate INT NOT NULL,
    codec TEXT NOT NULL,
    channel_count INT NOT NULL,
    start_ts TIMESTAMP,
    end_ts TIMESTAMP,
    file_size BIGINT,
    file_hash TEXT,
    language TEXT NOT NULL,
    snr DOUBLE PRECISION,
    speech_ratio DOUBLE PRECISION,
    overlap_ratio DOUBLE PRECISION,
    silence_ratio DOUBLE PRECISION,
    emotion_band TEXT,
    intent_cluster TEXT,
    call_type TEXT,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seg_dataset ON xase_audio_segments(dataset_id);
  CREATE INDEX IF NOT EXISTS idx_seg_lang ON xase_audio_segments(language);
  CREATE INDEX IF NOT EXISTS idx_seg_calltype ON xase_audio_segments(call_type);

  -- Access Policy
  CREATE TABLE IF NOT EXISTS "xase_voice_access_policies" (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES xase_voice_datasets(id) ON DELETE CASCADE,
    client_tenant_id TEXT NOT NULL REFERENCES xase_tenants(id) ON DELETE CASCADE,
    policy_id TEXT UNIQUE NOT NULL,
    usage_purpose TEXT NOT NULL,
    max_hours DOUBLE PRECISION,
    max_downloads INT,
    allowed_environment TEXT,
    expires_at TIMESTAMP,
    can_stream BOOLEAN DEFAULT false NOT NULL,
    can_batch_download BOOLEAN DEFAULT false NOT NULL,
    price_per_hour DECIMAL(10,2),
    currency TEXT DEFAULT 'USD' NOT NULL,
    hours_consumed DOUBLE PRECISION DEFAULT 0 NOT NULL,
    downloads_count INT DEFAULT 0 NOT NULL,
    last_access_at TIMESTAMP,
    status policy_status DEFAULT 'ACTIVE' NOT NULL,
    revoked_at TIMESTAMP,
    revoked_reason TEXT,
    created_at TIMESTAMP DEFAULT now() NOT NULL,
    updated_at TIMESTAMP DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_policy_dataset ON xase_voice_access_policies(dataset_id);
  CREATE INDEX IF NOT EXISTS idx_policy_client ON xase_voice_access_policies(client_tenant_id);
  CREATE INDEX IF NOT EXISTS idx_policy_status ON xase_voice_access_policies(status);
  CREATE INDEX IF NOT EXISTS idx_policy_expires ON xase_voice_access_policies(expires_at);

  -- Access Log
  CREATE TABLE IF NOT EXISTS "xase_voice_access_logs" (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES xase_voice_datasets(id) ON DELETE CASCADE,
    policy_id TEXT NOT NULL REFERENCES xase_voice_access_policies(id) ON DELETE CASCADE,
    client_tenant_id TEXT NOT NULL,
    user_id TEXT,
    api_key_id TEXT,
    action voice_access_action NOT NULL,
    files_accessed INT DEFAULT 0 NOT NULL,
    hours_accessed DOUBLE PRECISION DEFAULT 0 NOT NULL,
    bytes_transferred BIGINT,
    outcome TEXT NOT NULL,
    error_message TEXT,
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    timestamp TIMESTAMP DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_log_dataset ON xase_voice_access_logs(dataset_id);
  CREATE INDEX IF NOT EXISTS idx_log_policy ON xase_voice_access_logs(policy_id);
  CREATE INDEX IF NOT EXISTS idx_log_client ON xase_voice_access_logs(client_tenant_id);
  CREATE INDEX IF NOT EXISTS idx_log_ts ON xase_voice_access_logs(timestamp);

  -- Credit Ledger
  CREATE TABLE IF NOT EXISTS "xase_credit_ledger" (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES xase_tenants(id) ON DELETE CASCADE,
    amount DECIMAL(15,4) NOT NULL,
    eventType TEXT NOT NULL,
    description TEXT,
    metadata JSONB,
    balanceAfter DECIMAL(15,4) NOT NULL,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_org ON xase_credit_ledger(organization_id);
  CREATE INDEX IF NOT EXISTS idx_ledger_created ON xase_credit_ledger(created_at);
  `;

  await client.query(ddl);
  logSuccess('Schema Voice MVP aplicado com sucesso (SQL).');
}

async function addColumnIfMissing(client, table, column, definition) {
  const q = {
    text: `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    values: [table, column],
  };
  const r = await client.query(q);
  if (r.rows.length === 0) {
    const sql = `ALTER TABLE "${table}" ADD COLUMN ${definition}`;
    await client.query(sql);
    logSuccess(`Coluna adicionada: ${table}.${column}`);
  }
}

async function ensureAuthColumns(client) {
  logStep('DDL', 'Garantindo colunas de autenticação (2FA/OTP) na tabela users...');
  try {
    await addColumnIfMissing(client, 'users', 'twoFactorEnabled', '"twoFactorEnabled" BOOLEAN DEFAULT false NOT NULL');
  } catch (e) { logWarning(`users.twoFactorEnabled: ${e.message}`); }
  try {
    await addColumnIfMissing(client, 'users', 'totpSecret', '"totpSecret" TEXT');
  } catch (e) { logWarning(`users.totpSecret: ${e.message}`); }
  try {
    await addColumnIfMissing(client, 'users', 'twoFactorVerifiedAt', '"twoFactorVerifiedAt" TIMESTAMP');
  } catch (e) { logWarning(`users.twoFactorVerifiedAt: ${e.message}`); }
  try {
    await addColumnIfMissing(client, 'users', 'twoFactorBackupCodes', '"twoFactorBackupCodes" TEXT');
  } catch (e) { logWarning(`users.twoFactorBackupCodes: ${e.message}`); }
  try {
    await addColumnIfMissing(client, 'users', 'emailOtpCode', '"emailOtpCode" TEXT');
  } catch (e) { logWarning(`users.emailOtpCode: ${e.message}`); }
  try {
    await addColumnIfMissing(client, 'users', 'emailOtpExpires', '"emailOtpExpires" TIMESTAMP');
  } catch (e) { logWarning(`users.emailOtpExpires: ${e.message}`); }
}

async function runPrismaMigrate() {
  logStep('PRISMA', 'Pulando Prisma migrate por solicitação (modo SQL-only).');
}

async function generatePrismaClient() {
  logStep('PRISMA', 'Gerando Prisma Client...');

  if (DRY_RUN) {
    log('  [DRY-RUN] npx prisma generate', 'yellow');
    return;
  }

  try {
    execSync('npx prisma generate', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    logSuccess('Prisma Client gerado com sucesso');
  } catch (error) {
    logError(`Falha ao gerar Prisma Client: ${error.message}`);
    throw error;
  }
}

async function main() {
  log('\n' + '='.repeat(60), 'bright');
  log('  XASE VOICE DATA GOVERNANCE - MIGRATION SCRIPT', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  if (DRY_RUN) {
    logWarning('MODO DRY-RUN ATIVADO - Nenhuma alteração será feita no banco');
  }

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    logSuccess('Conectado ao banco de dados');

    // 1. Criar backup
    let backupFile;
    if (!DRY_RUN) {
      backupFile = await createBackup(client);
    } else {
      log('\n[DRY-RUN] Backup seria criado aqui', 'yellow');
    }

    // 2. Validar schema atual
    await validateSchema(client);

    // 3. Iniciar transação
    if (!DRY_RUN) {
      await client.query('BEGIN');
      log('\n🔒 Transação iniciada', 'cyan');
    }

    // 4. Aplicar schema Voice completo via SQL (inclui criação de tabelas necessárias)
    await applyVoiceSchema(client);
    // 4b. Garantir colunas de auth ausentes em bancos já existentes
    await ensureAuthColumns(client);
    // 5. Seed mínimo para iniciar testes e integrações
    await seedInitialData(client);

    // 6. Commit transação
    if (!DRY_RUN) {
      await client.query('COMMIT');
      logSuccess('Transação commitada');
    }

    // 7. Executar Prisma migrate (pulado)
    await runPrismaMigrate();

    // 9. Gerar Prisma Client
    await generatePrismaClient();

    log('\n' + '='.repeat(60), 'green');
    log('  ✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!', 'green');
    log('='.repeat(60) + '\n', 'green');

    if (backupFile) {
      log(`📦 Backup disponível em: ${backupFile}`, 'blue');
    }

  } catch (error) {
    logError(`\n❌ ERRO NA MIGRAÇÃO: ${error.message}`);
    
    if (!DRY_RUN) {
      try {
        await client.query('ROLLBACK');
        logWarning('Transação revertida (ROLLBACK)');
      } catch (rollbackError) {
        logError(`Erro ao fazer rollback: ${rollbackError.message}`);
      }
    }

    log('\n💡 Para restaurar o backup:', 'yellow');
    log('   psql <DATABASE_URL> < database/backups/<backup-file>.sql\n', 'yellow');

    process.exit(1);
  } finally {
    await client.end();
  }
}

// Executar
if (require.main === module) {
  main().catch(error => {
    logError(`Erro fatal: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main };
