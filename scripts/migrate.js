#!/usr/bin/env node
'use strict'

/**
 * XASE CORE - Migration Runner
 *
 * Executa migrações Prisma de forma segura (dev/prod) e lida com mudanças do Prisma 7.
 * - Dev: cria migration automaticamente com nome sugerido
 * - Prod: aplica migrations existentes
 *
 * Uso:
 *   node scripts/migrate.js                 # autodetecta ambiente por NODE_ENV
 *   NODE_ENV=production node scripts/migrate.js
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

function ensureEnv() {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL não definido no ambiente. Certifique-se de defini-lo antes de rodar as migrações.')
  }
}

function detectPrisma7Config() {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')
  const configPath = path.join(process.cwd(), 'prisma', 'prisma.config.ts')

  const hasConfigTs = fs.existsSync(configPath)
  const hasSchema = fs.existsSync(schemaPath)

  let schemaHasUrl = false
  if (hasSchema) {
    const content = fs.readFileSync(schemaPath, 'utf8')
    schemaHasUrl = /datasource\s+\w+\s*{[\s\S]*?url\s*=/.test(content)
  }

  return { hasConfigTs, hasSchema, schemaHasUrl }
}

function advisePrisma7({ hasConfigTs, schemaHasUrl }) {
  if (!hasConfigTs && schemaHasUrl) {
    console.warn('\n⚠️  Prisma 7: O campo `url` em schema.prisma é obsoleto para Migrate.')
    console.warn('    Crie prisma/prisma.config.ts e mova a configuração de conexão conforme docs:')
    console.warn('    https://pris.ly/d/config-datasource  |  https://pris.ly/d/prisma7-client-config\n')
  }
}

function main() {
  ensureEnv()

  const { hasConfigTs, schemaHasUrl } = detectPrisma7Config()
  advisePrisma7({ hasConfigTs, schemaHasUrl })

  // 1) Gerar client
  run('npx prisma generate')

  // 2) Migrar conforme ambiente
  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    console.log('\n🏭 Ambiente: production — aplicando migrations existentes...')
    run('npx prisma migrate deploy')
  } else {
    console.log('\n🧪 Ambiente: development — criando nova migration (se houver mudanças)...')
    const name = process.env.MIGRATION_NAME || 'xase_policy_model_snapshot_and_metadata'
    try {
      run(`npx prisma migrate dev --name ${name}`)
    } catch (err) {
      console.error('\n❌ Falha ao criar/applicar migration.')
      console.error('   Se o erro citar `datasource url`, ajuste para Prisma 7 (prisma.config.ts).')
      console.error('   Docs: https://pris.ly/d/config-datasource  |  https://pris.ly/d/prisma7-client-config')
      process.exit(1)
    }
  }

  console.log('\n✅ Migrações executadas com sucesso.')
}

main()
