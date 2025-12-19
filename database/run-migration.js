/**
 * XASE CORE - Execute Migration Script
 * 
 * Executa a migration SQL do Xase Core no PostgreSQL
 * Uso: node database/run-migration.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sanitizeDatabaseUrl(url) {
  if (!url) return url;
  // Corrige erro comum: export DATABASE_URL="=postgres://..."
  if (url.startsWith('=postgres://') || url.startsWith('=postgresql://')) {
    console.warn('⚠️  Removendo "=" inicial indevido do DATABASE_URL');
    return url.slice(1);
  }
  return url;
}

async function runMigration() {
  let connectionString = sanitizeDatabaseUrl(process.env.DATABASE_URL);
  if (!connectionString) {
    console.error('❌ DATABASE_URL não definido.');
    console.error('   Exemplo: export DATABASE_URL="postgres://user:pass@host:port/db?sslmode=disable"');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
  });

  try {
    log('\n🚀 XASE CORE - Database Migration', 'blue');
    log('=====================================\n', 'blue');

    // Conectar
    log('🔌 Conectando ao PostgreSQL...', 'yellow');
    await client.connect();
    log('✅ Conectado!', 'green');

    const executed = [];

    // 1) Sempre tentar aplicar xase-core-migration.sql se existir (idempotente)
    const coreSqlPath = path.join(__dirname, 'xase-core-migration.sql');
    if (fs.existsSync(coreSqlPath)) {
      log(`\n📄 Lendo migration: ${path.basename(coreSqlPath)}`, 'cyan');
      const coreSql = fs.readFileSync(coreSqlPath, 'utf8');
      log('⚙️  Executando migration (core)...', 'yellow');
      await client.query(coreSql);
      executed.push(path.basename(coreSqlPath));
      log('✅ Migration (core) executada com sucesso!', 'green');
    } else {
      log('\nℹ️  xase-core-migration.sql não encontrado, pulando...', 'yellow');
    }

    // 2) Aplicar todas as migrations em database/migrations/*.sql (idempotentes), sempre
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      if (files.length === 0) {
        log('\nℹ️  Nenhuma migration .sql encontrada em database/migrations', 'yellow');
      } else {
        log(`\n📋 Encontradas ${files.length} migrations em database/migrations`, 'cyan');
        for (const file of files) {
          const filePath = path.join(migrationsDir, file);
          log(`\n📄 Lendo migration: ${file}`, 'cyan');
          const sql = fs.readFileSync(filePath, 'utf8');
          log('⚙️  Executando migration...', 'yellow');
          try {
            await client.query(sql);
            executed.push(file);
            log(`✅ Migration executada com sucesso: ${file}`, 'green');
          } catch (e) {
            log(`⚠️  Erro ao aplicar ${file} (pode já estar aplicada). Detalhe: ${e.message}`, 'yellow');
          }
        }
      }
    } else {
      log('\nℹ️  Diretório database/migrations não existe, pulando...', 'yellow');
    }

    // Verificar tabelas criadas
    log('\n🔍 Verificando tabelas criadas...', 'cyan');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'xase_%'
      ORDER BY table_name;
    `);

    if (result.rows.length > 0) {
      log('\n✅ Tabelas Xase Core criadas:', 'green');
      result.rows.forEach(row => {
        log(`   - ${row.table_name}`, 'cyan');
      });
    }

    // Checklist essencial
    const have = new Set(result.rows.map((r) => r.table_name));
    const required = ['xase_tenants', 'xase_api_keys', 'xase_decision_records'];
    const missing = required.filter((t) => !have.has(t));
    if (missing.length > 0) {
      log('\n❗ Tabelas essenciais ausentes:', 'red');
      missing.forEach((t) => log(`   - ${t}`, 'red'));
      log('\nSugestões:', 'yellow');
      log(' - Confirme o DATABASE_URL (mesmo banco do Next.js)', 'cyan');
      log(' - Verifique se xase-core-migration.sql existe e foi aplicada', 'cyan');
      log(' - Rode novamente este script', 'cyan');
    }

    // Verificar colunas adicionadas ao User
    const userColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      AND column_name IN ('tenantId', 'xaseRole')
      ORDER BY column_name;
    `);

    if (userColumns.rows.length > 0) {
      log('\n✅ Colunas adicionadas à tabela User:', 'green');
      userColumns.rows.forEach(row => {
        log(`   - ${row.column_name} (${row.data_type})`, 'cyan');
      });
    }

    log('\n=====================================', 'blue');
    log('🎉 MIGRATION COMPLETA!', 'green');
    log('=====================================\n', 'blue');

    log('📋 Próximos passos:', 'yellow');
    log('1. Gerar Prisma Client: npx prisma generate', 'cyan');
    log('2. (Opcional) Criar primeiro tenant: node database/create-tenant.js', 'cyan');
    log('3. Testar API Xase: curl /api/xase/v1/records\n', 'cyan');
    if (executed.length) {
      log('🧾 Migrations aplicadas nesta execução:', 'yellow');
      executed.forEach((f) => log(`   - ${f}`, 'cyan'));
    }

  } catch (error) {
    log('\n❌ Erro na migration:', 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    log('🔌 Conexão fechada\n', 'yellow');
  }
}

// Executar
runMigration();
