#!/usr/bin/env node
/*
 * XASE: Raw SQL Migration Runner (sem Prisma Migrate)
 * - Lê e executa o arquivo SQL em prisma/migrations/20251217_xase_vendability_features/migration.sql
 * - Usa DATABASE_URL (PostgreSQL) do ambiente
 *
 * Uso:
 *   DATABASE_URL="postgres://..." node scripts/run-sql-migration.js
 *
 * Requisitos:
 *   - npm i pg (caso não tenha)
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('[✖] DATABASE_URL não definido. Passe via ambiente.')
    process.exit(1)
  }

  const sqlPath = path.resolve(
    process.cwd(),
    'prisma',
    'migrations',
    '20251217_xase_vendability_features',
    'migration.sql'
  )

  if (!fs.existsSync(sqlPath)) {
    console.error('[✖] Arquivo SQL não encontrado em:', sqlPath)
    process.exit(1)
  }

  const sql = fs.readFileSync(sqlPath, 'utf8')

  // Configuração SSL básica: desativa se URL contém sslmode=disable
  const sslDisabled = /sslmode=disable/i.test(dbUrl)
  const client = new Client({
    connectionString: dbUrl,
    ssl: sslDisabled ? false : undefined,
  })

  console.log('\n============================')
  console.log(' XASE: Raw SQL Migration')
  console.log('============================\n')
  console.log('[i] Conectando ao banco...')
  await client.connect()
  console.log('[i] Executando SQL...')

  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log('\n✅ Migração SQL aplicada com sucesso!')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n✖ Erro ao aplicar SQL:')
    console.error(err?.message || err)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('\n✖ Falha inesperada:', e?.message || e)
  process.exit(1)
})
