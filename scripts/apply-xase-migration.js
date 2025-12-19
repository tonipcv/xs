#!/usr/bin/env node
/*
 * XASE: Apply Vendability Migration and Generate Prisma Client
 * - Aplica todas as migrations pendentes (incluindo 20251217_xase_vendability_features)
 * - Roda prisma generate
 *
 * Uso:
 *   node scripts/apply-xase-migration.js
 *
 * Requisitos:
 *   - DATABASE_URL definido no .env ou no ambiente
 *   - prisma instalado (devDependency)
 */

const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    ...opts,
  })
  if (res.error) {
    throw res.error
  }
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`)
  }
}

function assertEnv() {
  if (!process.env.DATABASE_URL) {
    const envPath = path.resolve(process.cwd(), '.env')
    const hasEnv = fs.existsSync(envPath)
    console.error('\n[✖] DATABASE_URL não encontrado no ambiente.')
    if (hasEnv) {
      console.error('    Verifique seu arquivo .env na raiz do projeto.')
    }
    console.error('    Defina: export DATABASE_URL="postgresql://user:pass@host:port/db"\n')
    process.exit(1)
  }
}

async function main() {
  console.log('\n============================')
  console.log(' XASE: Apply DB Migration')
  console.log('============================\n')

  assertEnv()

  // 1) Mostrar migrations disponíveis
  const migrationsDir = path.resolve(process.cwd(), 'prisma', 'migrations')
  if (fs.existsSync(migrationsDir)) {
    const items = fs.readdirSync(migrationsDir).filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    console.log('[i] Migrations encontradas:')
    for (const it of items) console.log('   -', it)
  } else {
    console.warn('[!] Diretório prisma/migrations não encontrado. Continuando...')
  }

  // 2) Aplicar migrations pendentes (seguro para prod)
  console.log('\n[1/2] Aplicando migrations com prisma migrate deploy...\n')
  run('npx', ['prisma', 'migrate', 'deploy'])

  // 3) Gerar Prisma Client
  console.log('\n[2/2] Gerando Prisma Client...\n')
  run('npx', ['prisma', 'generate'])

  console.log('\n✅ Concluído com sucesso!')
}

main().catch((err) => {
  console.error('\n✖ Erro ao aplicar migration/generate:')
  console.error(err?.message || err)
  process.exit(1)
})
