#!/usr/bin/env node
/**
 * Reset DB (Seguro) - XASE
 *
 * Reseta o banco APENAS se a DATABASE_URL corresponder exatamente ao alvo esperado.
 * Exige --force para evitar acidentes.
 *
 * Uso:
 *  export DATABASE_URL="postgres://..." && node database/reset-db.js --force
 *  node database/reset-db.js --url="postgres://..." --force
 */

const { Client } = require('pg');
require('dotenv').config();

const TARGET_URL = 'postgres://postgres:f4c3d9b8d88fa9dbefb2@dpbdp1.easypanel.host:643/aa?sslmode=disable';

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const [k, v] = a.split('=');
    if (k.startsWith('--')) args[k.slice(2)] = v === undefined ? true : v;
  }
  return args;
}

function sanitizeUrl(url) {
  if (!url) return url;
  if (url.startsWith('=postgres://') || url.startsWith('=postgresql://')) return url.slice(1);
  return url.trim();
}

function maskUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.password) return u.href.replace(u.password, '***');
    return url;
  } catch {
    return url.replace(/:(.*)@/, ':***@');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const force = Boolean(args.force);
  const connectionString = sanitizeUrl(args.url || process.env.DATABASE_URL || '');

  if (!connectionString) {
    console.error('❌ DATABASE_URL ausente. Use --url ou defina no ambiente.');
    process.exit(1);
  }

  console.log('🔗 DATABASE_URL:', maskUrl(connectionString));

  if (!force) {
    console.error('❌ Falta o --force. Abortando por segurança.');
    process.exit(1);
  }

  if (connectionString !== TARGET_URL) {
    console.error('🛑 URL não corresponde ao alvo autorizado. Operação bloqueada.');
    console.error('Alvo autorizado:', maskUrl(TARGET_URL));
    process.exit(1);
  }

  const client = new Client({ connectionString });
  try {
    console.log('🔌 Conectando ao PostgreSQL...');
    await client.connect();
    console.log('✅ Conectado.');

    console.log('⚠️  Resetando schema public (DROP SCHEMA public CASCADE)...');
    await client.query('BEGIN');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    // Permissões padrão comuns
    await client.query('GRANT ALL ON SCHEMA public TO postgres');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    await client.query("COMMENT ON SCHEMA public IS 'standard public schema'");
    await client.query('COMMIT');
    console.log('🎯 Schema public recriado do zero.');

    console.log('\n📌 Próximos passos sugeridos:');
    console.log(' - Rodar migrations/SQL: node database/safe-sql-migrate.js --dir=database/migrations');
    console.log(' - Ou aplicar schema Prisma: npx prisma db push');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ Erro durante reset:', e.message || e);
    process.exitCode = 1;
  } finally {
    await client.end();
    console.log('🔌 Conexão fechada');
  }
}

main();
