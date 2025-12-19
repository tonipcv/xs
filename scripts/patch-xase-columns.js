#!/usr/bin/env node
'use strict'

/**
 * XASE CORE - Patch DB (DecisionRecord extra columns)
 *
 * Adiciona colunas opcionais que podem faltar em instalações antigas:
 * - policy_hash TEXT
 * - model_id TEXT
 * - model_version TEXT
 * - model_hash TEXT
 * - feature_schema_hash TEXT
 * - explanation_json TEXT
 *
 * Uso:
 *   DATABASE_URL="postgres://user:pass@host:port/db" node scripts/patch-xase-columns.js
 */

const { PrismaClient } = require('@prisma/client')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definido. Exemplo:')
    console.error('   DATABASE_URL="postgres://USER:PASS@HOST:PORT/DB" node scripts/patch-xase-columns.js')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  console.log('🔧 Iniciando patch de colunas na tabela xase_decision_records...')

  const statements = [
    // snake_case (mapeado por @map no Prisma atual)
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS policy_hash TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS model_id TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS model_version TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS model_hash TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS feature_schema_hash TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS explanation_json TEXT`,
    // camelCase (para compatibilidade com esquemas antigos/clients gerados)
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS "policyHash" TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS "modelId" TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS "modelVersion" TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS "modelHash" TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS "featureSchemaHash" TEXT`,
    `ALTER TABLE xase_decision_records ADD COLUMN IF NOT EXISTS "explanationJson" TEXT`
  ]

  try {
    for (const sql of statements) {
      console.log('→ Executando:', sql)
      await prisma.$executeRawUnsafe(sql)
    }
    console.log('✅ Patch concluído com sucesso.')
  } catch (e) {
    console.error('❌ Falha aplicando patch:', e && e.message ? e.message : e)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
