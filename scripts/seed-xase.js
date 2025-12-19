#!/usr/bin/env node
'use strict'

/**
 * XASE CORE - Seed completo (Tenant, Policy, DecisionRecord)
 *
 * Uso:
 *   DATABASE_URL="postgres://..." node scripts/seed-xase.js
 *
 * O que cria:
 *   - Tenant de demo (se não existir)
 *   - Política versionada (snapshot + hash)
 *   - 3 DecisionRecords encadeados com payloads
 */

const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function hashObject(obj) {
  const canonical = canonicalize(obj)
  return `sha256:${sha256Hex(canonical)}`
}

function canonicalize(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj)
  if (Array.isArray(obj)) return JSON.stringify(obj.map(i => (typeof i === 'object' ? JSON.parse(canonicalize(i)) : i)))
  if (typeof obj !== 'object') return JSON.stringify(obj)
  const keys = Object.keys(obj).sort()
  const out = {}
  for (const k of keys) out[k] = obj[k]
  return JSON.stringify(out)
}

function generateTransactionId() {
  return 'txn_' + crypto.randomBytes(16).toString('hex')
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definido. Exemplo:')
    console.error('   DATABASE_URL="postgres://USER:PASS@HOST:PORT/DB?schema=public" node scripts/seed-xase.js')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  console.log('🚀 Iniciando seed XASE...')

  try {
    // 1) Upsert Tenant
    const tenantEmail = 'demo@xase.local'
    const tenantName = 'XASE Demo Tenant'

    let tenant = await prisma.tenant.findFirst({ where: { email: tenantEmail } })
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: tenantName,
          email: tenantEmail,
          companyName: 'Xase Demo Co',
          industry: 'FINTECH',
          status: 'ACTIVE',
          plan: 'free',
        },
      })
      console.log('✓ Tenant criado:', tenant.id)
    } else {
      console.log('ℹ️ Tenant encontrado:', tenant.id)
    }

    // 2) Criar Policy (snapshot)
    const policy = {
      policyId: 'credit_policy',
      version: 'v4',
      document: {
        name: 'Credit Policy v4',
        thresholds: { min_score: 680, max_amount: 100000 },
        rules: [
          { id: 'rule_score', if: 'credit_score >= 680', then: 'allow' },
          { id: 'rule_amount', if: 'amount <= 100000', then: 'allow' },
          { id: 'rule_else', if: 'otherwise', then: 'manual_review' },
        ],
      },
      name: 'Credit Policy',
      description: 'Sample credit policy for demo',
    }

    const documentStr = JSON.stringify(policy.document)
    const documentHash = sha256Hex(documentStr)

    // Se a mesma policy/version já existir, reutiliza; caso contrário cria e desativa anteriores
    const existingPolicy = await prisma.policy.findFirst({
      where: { tenantId: tenant.id, policyId: policy.policyId, version: policy.version },
    })

    let createdPolicy
    if (existingPolicy) {
      createdPolicy = existingPolicy
      console.log('ℹ️ Policy já existe:', `${createdPolicy.policyId}@${createdPolicy.version}`)
    } else {
      // desativa versões ativas anteriores
      await prisma.policy.updateMany({
        where: { tenantId: tenant.id, policyId: policy.policyId, isActive: true },
        data: { isActive: false, deactivatedAt: new Date() },
      })

      createdPolicy = await prisma.policy.create({
        data: {
          tenantId: tenant.id,
          policyId: policy.policyId,
          version: policy.version,
          document: documentStr,
          documentHash,
          name: policy.name,
          description: policy.description,
          isActive: true,
        },
      })
      console.log('✓ Policy criada:', `${createdPolicy.policyId}@${createdPolicy.version}`)
    }

    // 3) Criar 3 DecisionRecords encadeados
    // Se já existirem records, continue a corrente a partir do último
    const lastRecord = await prisma.decisionRecord.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
    })
    let previousHash = lastRecord?.recordHash || null

    for (let i = 0; i < 3; i++) {
      const input = { user_id: `u_${1000 + i}`, amount: 50000 + i * 2500, credit_score: 700 + i * 5 }
      const output = { decision: i === 2 ? 'REVIEW' : 'APPROVED' }
      const context = { channel: 'web', policy_used: policy.version }

      const inputHash = hashObject(input)
      const outputHash = hashObject(output)
      const contextHash = hashObject(context)

      const combined = `${inputHash}${outputHash}${contextHash}`
      const recordHashHex = sha256Hex((previousHash ? previousHash : '') + combined)
      const recordHash = recordHashHex

      const transactionId = generateTransactionId()

      // Evita colisão: se recordHash já existir, apenas atualiza ponteiro e segue próximo
      const exists = await prisma.decisionRecord.findFirst({ where: { tenantId: tenant.id, recordHash } })
      if (exists) {
        console.log(`ℹ️ Record já existe para hash=${recordHash.slice(0,12)}..., pulando criação (txn=${exists.transactionId})`)
        previousHash = exists.recordHash
        continue
      }

      const record = await prisma.decisionRecord.create({
        data: {
          tenantId: tenant.id,
          transactionId,
          policyId: policy.policyId,
          policyVersion: policy.version,
          policyHash: `sha256:${documentHash}`,
          inputHash,
          outputHash,
          contextHash,
          recordHash,
          previousHash: previousHash,
          decisionType: 'loan_approval',
          confidence: 0.92,
          processingTime: 100 + Math.floor(Math.random()*50),
          inputPayload: JSON.stringify(input),
          outputPayload: JSON.stringify(output),
          contextPayload: JSON.stringify(context),
        },
      })

      console.log(`✓ Record criado: ${record.transactionId} (record_hash=${record.recordHash.slice(0,12)}...)`)
      previousHash = record.recordHash
    }

    console.log('\n✅ Seed concluído com sucesso.')
    console.log('Dica: use a última transactionId para exportar o bundle.')
  } catch (e) {
    console.error('❌ Seed falhou:', e)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
