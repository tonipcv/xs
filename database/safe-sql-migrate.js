#!/usr/bin/env node
/**
 * Safe SQL Migrate - XASE
 *
 * Executa SQL em PostgreSQL com segurança:
 * - Conexão via DATABASE_URL ou --url
 * - Retentativas com backoff exponencial
 * - Lock advisory para evitar corridas
 * - Execução transacional por arquivo
 * - Bloqueio de comandos destrutivos por padrão (use --allow-destructive para liberar)
 * - Aceita um arquivo único (--file) ou um diretório (--dir) com .sql (ordem alfabética)
 *
 * Uso:
 *  node database/safe-sql-migrate.js --file=database/xase-core-migration.sql
 *  node database/safe-sql-migrate.js --dir=database/migrations
 *  node database/safe-sql-migrate.js --dir=database/migrations --url="postgres://..."
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

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const [k, v] = a.split('=');
    if (k.startsWith('--')) args[k.slice(2)] = v === undefined ? true : v;
  }
  return args;
}

function sanitizeDatabaseUrl(url) {
  if (!url) return url;
  if (url.startsWith('=postgres://') || url.startsWith('=postgresql://')) return url.slice(1);
  return url;
}

function maskUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.password) {
      const masked = u.href.replace(u.password, '***');
      return masked;
    }
    return url;
  } catch {
    return url.replace(/:(.*)@/, ':***@');
  }
}

function hasDestructiveCommands(sql) {
  const s = sql.replace(/--.*$/mg, '').replace(/\/\*[\s\S]*?\*\//g, '').toUpperCase();
  const forbidden = [
    'DROP TABLE',
    'DROP SCHEMA',
    'TRUNCATE ',
    'ALTER TABLE',
  ];
  return forbidden.some(f => s.includes(f));
}

async function connectWithRetry(connectionString, maxAttempts = 8) {
  let attempt = 0;
  let lastError;
  while (attempt < maxAttempts) {
    attempt++;
    const client = new Client({ connectionString });
    try {
      await client.connect();
      return client;
    } catch (e) {
      lastError = e;
      const wait = Math.min(30000, 500 * Math.pow(2, attempt));
      log(`Conexão falhou (tentativa ${attempt}/${maxAttempts}): ${e.code || e.message}. Retentando em ${wait}ms...`, 'yellow');
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastError;
}

async function withAdvisoryLock(client, lockKeyText, fn) {
  const keyQuery = `SELECT pg_advisory_lock(hashtext($1))`;
  const unlockQuery = `SELECT pg_advisory_unlock(hashtext($1))`;
  await client.query(keyQuery, [lockKeyText]);
  try {
    return await fn();
  } finally {
    await client.query(unlockQuery, [lockKeyText]);
  }
}

async function execSqlFileTransactional(client, filePath, allowDestructive) {
  const sql = fs.readFileSync(filePath, 'utf8');

  if (!allowDestructive && hasDestructiveCommands(sql)) {
    throw new Error(`Comandos destrutivos detectados em ${path.basename(filePath)}. Use --allow-destructive para permitir.`);
  }

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw new Error(`Erro executando ${path.basename(filePath)}: ${e.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const allowDestructive = Boolean(args['allow-destructive']);
  const fileArg = args.file;
  const dirArg = args.dir;
  let connectionString = sanitizeDatabaseUrl(args.url || process.env.DATABASE_URL || '');

  if (!connectionString) {
    log('❌ DATABASE_URL ausente. Informe via .env ou --url', 'red');
    process.exit(1);
  }

  log('🔗 DATABASE_URL: ' + maskUrl(connectionString), 'cyan');

  if (!fileArg && !dirArg) {
    log('ℹ️  Nenhum --file ou --dir informado. Usando defaults:', 'yellow');
    log('   - database/xase-core-migration.sql (se existir)', 'yellow');
    log('   - database/migrations/*.sql (se existir)', 'yellow');
  }

  const client = await connectWithRetry(connectionString);
  log('✅ Conectado ao PostgreSQL', 'green');

  try {
    await withAdvisoryLock(client, 'xase_safe_sql_migrate_lock', async () => {
      const executed = [];

      // 1) arquivo único --file
      if (fileArg) {
        const filePath = path.resolve(fileArg);
        if (!fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`);
        log(`\n📄 Executando arquivo: ${path.basename(filePath)}`, 'cyan');
        await execSqlFileTransactional(client, filePath, allowDestructive);
        executed.push(path.basename(filePath));
      }

      // 2) diretório --dir
      if (dirArg) {
        const dirPath = path.resolve(dirArg);
        if (!fs.existsSync(dirPath)) throw new Error(`Diretório não encontrado: ${dirPath}`);
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.sql')).sort();
        if (files.length === 0) log('ℹ️  Nenhum .sql encontrado no diretório', 'yellow');
        for (const f of files) {
          const filePath = path.join(dirPath, f);
          log(`\n📄 Executando migration: ${f}`, 'cyan');
          try {
            await execSqlFileTransactional(client, filePath, allowDestructive);
            executed.push(f);
            log(`✅ OK: ${f}`, 'green');
          } catch (e) {
            log(`⚠️  Falha em ${f}: ${e.message}`, 'yellow');
            throw e; // interrompe o fluxo para segurança
          }
        }
      }

      // 3) defaults se nada informado
      if (!fileArg && !dirArg) {
        const core = path.resolve('database/xase-core-migration.sql');
        if (fs.existsSync(core)) {
          log(`\n📄 Executando default: ${path.basename(core)}`, 'cyan');
          await execSqlFileTransactional(client, core, allowDestructive);
          executed.push(path.basename(core));
        }
        const migDir = path.resolve('database/migrations');
        if (fs.existsSync(migDir)) {
          const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
          for (const f of files) {
            const filePath = path.join(migDir, f);
            log(`\n📄 Executando migration: ${f}`, 'cyan');
            await execSqlFileTransactional(client, filePath, allowDestructive);
            executed.push(f);
          }
        }
      }

      if (executed.length) {
        log('\n🧾 Arquivos executados:', 'yellow');
        executed.forEach(f => log(`  - ${f}`, 'cyan'));
      } else {
        log('\nℹ️  Nada a executar.', 'yellow');
      }
    });

    log('\n🎉 Concluído com sucesso', 'green');
  } catch (e) {
    log('\n❌ Erro na execução:', 'red');
    console.error(e.message || e);
    process.exitCode = 1;
  } finally {
    await client.end();
    log('🔌 Conexão fechada', 'yellow');
  }
}

main();
