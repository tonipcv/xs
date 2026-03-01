/*
 Seed 1000 realistic insurance claims for a dedicated demo tenant.
 Usage:
   npx ts-node tests/insurance-demo/data/seed-claims.ts
*/

import { prisma } from '../../../src/lib/prisma'
import { hashObject, chainHash, generateTransactionId } from '../../../src/lib/xase/crypto'
import { DecisionType, InsuranceClaimType, DecisionConsumerImpact } from '@prisma/client'
import { makeClaim, DemoClaim } from './scenarios'

const DEMO_TENANT_EMAIL = 'demo-insurance@xase.local'
const DEMO_TENANT_NAME = 'tenant_demo_insurance'

async function ensureDemoTenant() {
  // Find by email to avoid clashing with production tenants
  let tenant = await prisma.tenant.findFirst({ where: { email: DEMO_TENANT_EMAIL } })
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        email: DEMO_TENANT_EMAIL,
        name: DEMO_TENANT_NAME,
        companyName: 'Xase Demo Insurance',
        status: 'ACTIVE',
        plan: 'enterprise',
      },
    })
  }
  return tenant
}

function makeDecisionPayloads(claim: DemoClaim) {
  const input = {
    claimant_profile: {
      age: Math.max(18, Math.round(20 + Math.random() * 50)),
      location: ['London', 'Manchester', 'Leeds', 'Bristol'][Math.floor(Math.random() * 4)],
    },
    claim: {
      claim_number: claim.claimNumber,
      policy_number: claim.policyNumber,
      type: claim.claimType,
      amount: claim.amount,
      occurred_at: claim.occurredAt.toISOString(),
    },
    channel: ['web', 'phone', 'agent'][Math.floor(Math.random() * 3)],
  }

  const output = claim.manualReview
    ? { decision: 'MANUAL_REVIEW', payout: 0 }
    : claim.approved
      ? { decision: 'APPROVED', payout: Math.round(claim.amount * (0.6 + Math.random() * 0.3)) }
      : { decision: 'REJECTED', payout: 0 }

  const context = {
    model_id: 'claims_classifier_v2',
    model_version: '2.1.0',
    route: 'ingest_demo_seed',
  }

  return { input, output, context }
}

async function seed() {
  const tenant = await ensureDemoTenant()
  console.log(`[seed] Using tenant ${tenant.id} (${tenant.email})`)

  const TOTAL = 1000
  const batchSize = 100

  // For proper chainHash, we need to keep the order by occurredAt ascending
  const claims: DemoClaim[] = Array.from({ length: TOTAL }, (_, i) => makeClaim(i + 1))
  claims.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())

  // Track last record hash for chaining
  let lastRecord = await prisma.decisionRecord.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { timestamp: 'desc' },
    select: { recordHash: true },
  })
  let previousHash: string | null = lastRecord?.recordHash || null

  for (let i = 0; i < claims.length; i += batchSize) {
    const chunk = claims.slice(i, i + batchSize)

    const dataToCreate = chunk.map((claim) => {
      const { input, output, context } = makeDecisionPayloads(claim)

      const inputHash = hashObject(input)
      const outputHash = hashObject(output)
      const contextHash = hashObject(context)
      const combined = `${inputHash}${outputHash}${contextHash}`
      // Keep a local copy of previous hash for storage
      const prevForStorage = previousHash
      const recordHash = chainHash(prevForStorage, combined)

      // Set up for next in sequence (advance chain head)
      previousHash = recordHash

      const transactionId = generateTransactionId()

      return {
        recordData: {
          tenantId: tenant.id,
          transactionId,
          policyId: 'insurance_policy_demo',
          policyVersion: 'v1.0',
          inputHash,
          outputHash,
          contextHash,
          recordHash,
          previousHash: prevForStorage,
          decisionType: DecisionType.CLAIM,
          confidence: claim.confidence,
          processingTime: Math.round(50 + Math.random() * 200),
          inputPayload: JSON.stringify(input),
          outputPayload: JSON.stringify(output),
          contextPayload: JSON.stringify(context),
          timestamp: claim.occurredAt,
        },
        insuranceData: {
          claimNumber: claim.claimNumber,
          claimType: claim.claimType as unknown as InsuranceClaimType,
          claimAmount: claim.amount,
          claimDate: claim.occurredAt,
          policyNumber: claim.policyNumber,
          decisionOutcome: output.decision,
          decisionOutcomeReason: claim.manualReview ? 'Manual review required' : 'Model decision',
          decisionImpactConsumerImpact:
            claim.amount > 50000
              ? DecisionConsumerImpact.HIGH
              : claim.amount > 10000
              ? DecisionConsumerImpact.MEDIUM
              : DecisionConsumerImpact.LOW,
        },
      }
    })

    // Create sequentially to avoid interactive transaction issues (P2028)
    for (const item of dataToCreate) {
      await prisma.decisionRecord.create({
        data: {
          ...item.recordData,
          insuranceDecision: {
            create: {
              ...item.insuranceData,
            },
          },
        },
      })
    }

    console.log(`[seed] Inserted ${Math.min(i + batchSize, claims.length)} / ${claims.length}`)
  }

  console.log('[seed] Done.')
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
