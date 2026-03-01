/*
 Seed advanced insurance dataset for a dedicated demo tenant (v2):
 - 1000 claims across last 90 days
 - ~15% human interventions (oversight)
 - Populated modelId/modelVersion
 - Reproducibility snapshots (EXTERNAL_DATA, BUSINESS_RULES)

 Usage:
   npm run demo2:seed
*/

import { prisma } from '../../../src/lib/prisma'
import { hashObject, chainHash, generateTransactionId } from '../../../src/lib/xase/crypto'
import { DecisionType, InsuranceClaimType, DecisionConsumerImpact, InterventionAction, SnapshotType } from '@prisma/client'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'

function ensureLog(msg: string) {
  console.log(msg)
}

const DEMO_TENANT_EMAIL = process.env.DEMO2_EMAIL || 'demo-insurance-advanced@xase.local'
const DEMO_TENANT_NAME = (process.env.DEMO2_EMAIL ? `tenant_${process.env.DEMO2_EMAIL.replace(/[@.]/g, '_')}` : 'tenant_demo_insurance_v2')

// Random helpers (reuse simple logic)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function weightedPick<T>(items: { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const i of items) {
    if (r < i.weight) return i.value
    r -= i.weight
  }
  return items[items.length - 1].value
}

function randomClaimType(): InsuranceClaimType {
  return weightedPick<InsuranceClaimType>([
    { value: 'AUTO', weight: 35 },
    { value: 'HEALTH', weight: 20 },
    { value: 'LIFE', weight: 10 },
    { value: 'PROPERTY', weight: 20 },
    { value: 'LIABILITY', weight: 10 },
    { value: 'TRAVEL', weight: 5 },
  ])
}

function randomAmount(): number {
  const base = Math.pow(10, Math.random() * 3.7 + 2.7)
  return Math.min(500000, Math.max(500, Math.round(base)))
}

function randomDateInLastDays(days: number): Date {
  const now = Date.now()
  const past = now - days * 24 * 60 * 60 * 1000
  const ts = randomInt(past, now)
  return new Date(ts)
}

function randomApproval(): { decision: 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW'; confidence: number } {
  const r = Math.random()
  if (r < 0.10) return { decision: 'MANUAL_REVIEW', confidence: 0.45 + Math.random() * 0.1 } // 0.45-0.55
  if (r < 0.40) return { decision: 'REJECTED', confidence: 0.6 + Math.random() * 0.2 } // 0.6-0.8
  return { decision: 'APPROVED', confidence: 0.8 + Math.random() * 0.2 } // 0.8-1.0
}

async function ensureDemoTenant() {
  let tenant = await prisma.tenant.findFirst({ where: { email: DEMO_TENANT_EMAIL } })
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        email: DEMO_TENANT_EMAIL,
        name: DEMO_TENANT_NAME,
        companyName: 'Xase Demo Insurance Advanced',
        status: 'ACTIVE',
        plan: 'enterprise',
      },
    })
  }
  return tenant
}

function makeDecisionPayloads(i: number, claimType: InsuranceClaimType, amount: number, when: Date, modelId: string, modelVersion: string) {
  const input = {
    claimant_profile: {
      age: Math.max(18, Math.round(20 + Math.random() * 50)),
      location: ['London', 'Manchester', 'Leeds', 'Bristol'][Math.floor(Math.random() * 4)],
    },
    claim: {
      claim_number: `CLM-${when.toISOString().slice(0, 10)}-${String(i).padStart(4, '0')}`,
      policy_number: `POL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      type: claimType,
      amount,
      occurred_at: when.toISOString(),
    },
    channel: ['web', 'phone', 'agent'][Math.floor(Math.random() * 3)],
  }

  const base = randomApproval()
  const output =
    base.decision === 'MANUAL_REVIEW'
      ? { decision: 'MANUAL_REVIEW', payout: 0 }
      : base.decision === 'APPROVED'
      ? { decision: 'APPROVED', payout: Math.round(amount * (0.6 + Math.random() * 0.3)) }
      : { decision: 'REJECTED', payout: 0 }

  const context = {
    model_id: modelId,
    model_version: modelVersion,
    route: 'ingest_demo_seed_v2',
  }

  return { input, output, context, confidence: base.confidence }
}

async function createSnapshot(tenantId: string, type: SnapshotType, payload: any, sourceMeta?: any) {
  const payloadHash = hashObject(payload)
  // For demo: in-memory URL/key
  const storageKey = `memory://${type}/${crypto.randomUUID()}.json`
  const storageUrl = storageKey
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const snap = await prisma.evidenceSnapshot.create({
        data: {
          tenantId,
          type,
          storageUrl,
          storageKey,
          payloadHash,
          payloadSize: Buffer.byteLength(JSON.stringify(payload)),
          sourceMeta: sourceMeta ? JSON.stringify(sourceMeta) : null,
          compressed: false,
        },
      })
      return snap.id
    } catch (e: any) {
      if (e?.code === 'P1001' && attempt < maxAttempts) {
        const backoffMs = attempt * 600
        console.warn(`[seed-v2] Snapshot create transient error (P1001). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxAttempts})`)
        await new Promise((r) => setTimeout(r, backoffMs))
        continue
      }
      throw e
    }
  }
  throw new Error('Unexpected: snapshot create retries exhausted')
}

async function seed() {
  ensureLog('✅ Prisma conectado ao banco de dados')
  const tenant = await ensureDemoTenant()
  ensureLog(`[seed-v2] Using tenant ${tenant.id} (${tenant.email})`)

  const TOTAL = 1000
  const existing = await prisma.decisionRecord.count({ where: { tenantId: tenant.id } })
  if (existing >= TOTAL) {
    ensureLog(`[seed-v2] Already has ${existing} records (>= ${TOTAL}). Nothing to do.`)
    return
  }
  const toInsert = TOTAL - existing
  ensureLog(`[seed-v2] Continuing seed: existing=${existing}, toInsert=${toInsert}, target=${TOTAL}`)
  const claims = Array.from({ length: toInsert }, (_, idx) => ({
    i: existing + idx + 1, // global index to keep identifiers monotonic
    claimType: randomClaimType(),
    amount: randomAmount(),
    when: randomDateInLastDays(90),
  }))
  claims.sort((a, b) => a.when.getTime() - b.when.getTime())

  let lastRecord = await prisma.decisionRecord.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { timestamp: 'desc' },
    select: { recordHash: true },
  })
  let previousHash: string | null = lastRecord?.recordHash || null

  for (let k = 0; k < claims.length; k++) {
    const { i, claimType, amount, when } = claims[k]

    // Model metadata (rotate between a few realistic IDs/versions)
    const modelId = ['claims_classifier_v2', 'claims_classifier_v2', 'fraud_detector_v1'][i % 3]
    const modelVersion = modelId === 'fraud_detector_v1' ? '1.3.2' : '2.1.' + String((i % 5) + 1)

    const { input, output, context, confidence } = makeDecisionPayloads(i, claimType, amount, when, modelId, modelVersion)

    // Snapshots: minimal but present
    const externalData = { weather_api: { tempC: Math.round(Math.random() * 30) }, sanctions_check: Math.random() < 0.02 ? 'HIT' : 'CLEAR' }
    const businessRules = { payout_ratio_max: 0.9, manual_review_threshold: 50000, version: 'br-2025-12' }

    const externalDataSnapshotId = await createSnapshot(tenant.id, 'EXTERNAL_DATA', externalData, { provider: 'demo' })
    const businessRulesSnapshotId = await createSnapshot(tenant.id, 'BUSINESS_RULES', businessRules, { ruleset: 'demo' })

    const inputHash = hashObject(input)
    const outputHash = hashObject(output)
    const contextHash = hashObject(context)
    const combined = `${inputHash}${outputHash}${contextHash}`
    const prevForStorage = previousHash
    const recordHash = chainHash(prevForStorage, combined)
    previousHash = recordHash

    const transactionId = generateTransactionId()

    // Decide if there will be a human intervention (HITL) and compute fields upfront
    const willIntervene = Math.random() < 0.15
    const action = willIntervene
      ? weightedPick<InterventionAction>([
          { value: 'APPROVED', weight: 40 },
          { value: 'REJECTED', weight: 30 },
          { value: 'OVERRIDE', weight: 30 },
        ])
      : null
    const finalDecisionSource = willIntervene
      ? action === 'OVERRIDE'
        ? 'HUMAN_OVERRIDE'
        : action === 'APPROVED'
        ? 'HUMAN_APPROVED'
        : 'HUMAN_REJECTED'
      : 'AI'

    await prisma.decisionRecord.create({
      data: {
        tenantId: tenant.id,
        transactionId,
        policyId: 'insurance_policy_demo_v2',
        policyVersion: 'v2.0',
        modelId,
        modelVersion,
        inputHash,
        outputHash,
        contextHash,
        recordHash,
        previousHash: prevForStorage,
        decisionType: DecisionType.CLAIM,
        confidence,
        processingTime: Math.round(40 + Math.random() * 160),
        inputPayload: JSON.stringify(input),
        outputPayload: JSON.stringify(output),
        contextPayload: JSON.stringify(context),
        timestamp: when,
        externalDataSnapshotId,
        businessRulesSnapshotId,
        hasHumanIntervention: willIntervene,
        finalDecisionSource,
        insuranceDecision: {
          create: {
            claimNumber: input.claim.claim_number,
            claimType: claimType,
            claimAmount: amount,
            claimDate: when,
            policyNumber: input.claim.policy_number,
            decisionOutcome: output.decision,
            decisionOutcomeReason: output.decision === 'MANUAL_REVIEW' ? 'Manual review required' : 'Model decision',
            decisionImpactConsumerImpact:
              amount > 50000
                ? DecisionConsumerImpact.HIGH
                : amount > 10000
                ? DecisionConsumerImpact.MEDIUM
                : DecisionConsumerImpact.LOW,
          },
        },
        interventions: willIntervene
          ? {
              create: {
                tenantId: tenant.id,
                action: action!,
                actorName: 'Demo Reviewer',
                actorEmail: 'reviewer@partner-insurance.local',
                reason: action === 'OVERRIDE' ? 'Edge case – policy exception' : 'Manual verification',
                notes: 'Seed v2 auto-generated intervention',
                previousOutcome: JSON.stringify(output),
                newOutcome:
                  action === 'OVERRIDE'
                    ? JSON.stringify({ decision: output.decision === 'APPROVED' ? 'REJECTED' : 'APPROVED' })
                    : null,
              },
            }
          : undefined,
      },
      select: { id: true }
    })

    const insertedSoFar = existing + k + 1
    if ((k + 1) % 100 === 0 || k === claims.length - 1) {
      ensureLog(`[seed-v2] Inserted ${k + 1} / ${claims.length} (total now ≈ ${insertedSoFar}/${TOTAL})`)
    }
  }

  ensureLog('[seed-v2] Done.')
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
