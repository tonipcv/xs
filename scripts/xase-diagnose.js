#!/usr/bin/env node

/**
 * XASE - Diagnóstico de Ambiente e Banco
 *
 * Objetivo: identificar por que a API retorna "Authentication error" e/ou
 * "table public.xase_api_keys does not exist".
 *
 * O que o script faz:
 * 1) Lê DATABASE_URL de .env e .env.local e mostra diferenças
 * 2) Sanitiza DATABASE_URL (remove '=' inicial acidental)
 * 3) Conecta no banco atual (process.env.DATABASE_URL) e imprime:
 *    - current_database()
 *    - versão do servidor
 *    - tabelas xase_% existentes
 *    - contagem em xase_api_keys e prefixos
 *    - contagem de tenants e decision_records
 * 4) Sugere ações se divergências forem detectadas
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

function readEnvFile(dbPath) {
  try {
    const p = path.join(process.cwd(), dbPath);
    if (!fs.existsSync(p)) return null;
    const content = fs.readFileSync(p, 'utf8');
    const line = content.split(/\r?\n/).find(l => l.trim().startsWith('DATABASE_URL='));
    return line ? line.replace(/^DATABASE_URL=/, '') : null;
  } catch {
    return null;
  }
}

function maskUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url.replace(/^=/, ''));
    const user = u.username || '';
    const host = u.hostname;
    const port = u.port;
    const db = u.pathname.replace('/', '');
    return `${u.protocol}//${user ? user + ':***@' : ''}${host}:${port}/${db}${u.search || ''}`;
  } catch {
    return url.replace(/:(?:[^@/]+)@/, ':***@');
  }
}

function sanitizeUrl(url) {
  if (!url) return url;
  if (url.startsWith('=postgres://') || url.startsWith('=postgresql://')) return url.slice(1);
  return url;
}

async function main() {
  console.log('🔎 XASE Diagnose - Ambiente e Banco');
  console.log('===================================');

  const dotEnvUrl = readEnvFile('.env');
  const dotEnvLocalUrl = readEnvFile('.env.local');

  console.log('\n📄 .env ->', maskUrl(dotEnvUrl) || '(sem DATABASE_URL)');
  console.log('📄 .env.local ->', maskUrl(dotEnvLocalUrl) || '(sem DATABASE_URL)');

  let runtimeUrl = process.env.DATABASE_URL;
  if (!runtimeUrl) {
    console.log('\n⚠️  process.env.DATABASE_URL ausente no runtime. Usando .env.local > .env');
    runtimeUrl = dotEnvLocalUrl || dotEnvUrl || '';
  }

  runtimeUrl = sanitizeUrl(runtimeUrl || '');
  if (!runtimeUrl) {
    console.error('\n❌ Não há DATABASE_URL disponível. Configure em .env ou .env.local');
    process.exit(1);
  }

  console.log('\n🧪 Usando DATABASE_URL (runtime):', maskUrl(runtimeUrl));

  const client = new Client({ connectionString: runtimeUrl });
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    const [{ current_database }] = (await client.query('SELECT current_database()')).rows;
    const [{ version }] = (await client.query('SELECT version()'))?.rows || [{ version: 'unknown' }];
    console.log('   • current_database =', current_database);
    console.log('   • server_version  =', version);

    const xaseTables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'xase_%'
      ORDER BY table_name
    `);
    const tables = xaseTables.rows.map(r => r.table_name);
    console.log('   • xase tables     =', tables);

    const essentials = ['xase_tenants', 'xase_api_keys', 'xase_decision_records'];
    const missing = essentials.filter(t => !tables.includes(t));
    if (missing.length) {
      console.log('\n❗ Tabelas essenciais ausentes:', missing);
    }

    // Contagens
    const counts = {};
    for (const t of ['xase_tenants', 'xase_api_keys', 'xase_decision_records', 'xase_audit_logs']) {
      try {
        const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
        counts[t] = r.rows[0].c;
      } catch (e) {
        counts[t] = 'N/A';
      }
    }
    console.log('\n📊 Contagens:', counts);

    // API keys sample
    if (tables.includes('xase_api_keys')) {
      try {
        const r = await client.query(`SELECT "keyPrefix","isActive","createdAt" FROM xase_api_keys ORDER BY "createdAt" DESC LIMIT 5`);
        console.log('\n🔑 API Key samples (prefixos):', r.rows);
      } catch (e) {
        console.log('\n🔑 API Key samples indisponível:', e.message);
      }
    }

    console.log('\n✅ Diagnóstico concluído.');

    // Sugestões
    console.log('\n💡 Sugestões:');
    if (dotEnvUrl && dotEnvLocalUrl && dotEnvUrl !== dotEnvLocalUrl) {
      console.log(' - .env e .env.local possuem DATABASE_URL diferentes. O Next prioriza .env.local.');
    }
    if (missing.length) {
      console.log(' - Rode: node database/run-migration.js (garantindo que o Next use o mesmo DATABASE_URL)');
    }
    console.log(' - Reinicie o Next após alterar .env/.env.local (para recarregar DATABASE_URL)');

  } catch (e) {
    console.error('\n❌ Erro de conexão/consulta:', e.message);
    process.exit(1);
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
