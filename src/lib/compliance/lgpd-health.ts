// LGPD (saúde) helpers - Art. 11 consent tracking and ROPA scaffolding (MVP)
import { prisma } from '@/lib/prisma'
import { ConsentStatus as PrismaConsentStatus, LeaseStatus as PrismaLeaseStatus } from '@prisma/client'

export type HealthConsentPayload = {
  datasetId: string
  tenantId: string
  subjectId?: string
  legalBasis: 'EXPLICIT_CONSENT' | 'HEALTH_PROTECTION' | 'RESEARCH_ANONYMIZED' | 'CONTROLLER_OBLIGATION'
  purpose: string
  version: string
  proofUri?: string
  proofHash?: string
}

export function validateConsentPayload(p: any): asserts p is HealthConsentPayload {
  if (!p || typeof p !== 'object') throw new Error('Invalid payload')
  if (!p.datasetId || !p.tenantId || !p.purpose || !p.version) throw new Error('Missing required fields')
}

export type ROPARecord = {
  controller: string
  datasetId: string
  processingPurpose: string
  legalBasis: string
  dataCategories: string[]
  recipients?: string[]
  dpo?: string
  retention?: string
}

export async function buildRopaRecord(input: {
  tenantId: string
  controller: string
  datasetId: string
  purpose: string
  legalBasis: string
  dataCategories: string[]
  recipients?: string[]
  dpo?: string
  retention?: string
}): Promise<ROPARecord> {
  const record: ROPARecord = {
    controller: input.controller,
    datasetId: input.datasetId,
    processingPurpose: input.purpose,
    legalBasis: input.legalBasis,
    dataCategories: input.dataCategories,
    recipients: input.recipients,
    dpo: input.dpo,
    retention: input.retention,
  }

  // Persist to database
  await prisma.rOPARecord.create({
    data: {
      tenantId: input.tenantId,
      datasetId: input.datasetId,
      controller: input.controller,
      processingPurpose: input.purpose,
      legalBasis: input.legalBasis,
      dataCategories: input.dataCategories,
      recipients: input.recipients || [],
      dpoContact: input.dpo || null,
      retentionPeriod: input.retention || null,
      recordData: record,
    },
  })

  return record
}

export function isHealthLegalBasisAllowed(legalBasis: HealthConsentPayload['legalBasis']): boolean {
  return [
    'EXPLICIT_CONSENT',
    'HEALTH_PROTECTION',
    'RESEARCH_ANONYMIZED',
    'CONTROLLER_OBLIGATION',
  ].includes(legalBasis)
}

export async function registerHealthConsent(payload: HealthConsentPayload) {
  validateConsentPayload(payload)
  if (!isHealthLegalBasisAllowed(payload.legalBasis)) {
    throw new Error('Illegal legalBasis for LGPD-Health')
  }

  const updated = await prisma.dataset.updateMany({
    where: { datasetId: payload.datasetId, tenantId: payload.tenantId },
    data: {
      consentStatus: PrismaConsentStatus.VERIFIED_BY_XASE,
      consentProofUri: payload.proofUri || null,
      consentProofHash: payload.proofHash || null,
    },
  })

  await prisma.auditLog.create({
    data: {
      tenantId: payload.tenantId,
      action: 'LGPD_HEALTH_CONSENT_REGISTERED',
      resourceType: 'DATASET',
      resourceId: payload.datasetId,
      metadata: JSON.stringify({
        legalBasis: payload.legalBasis,
        purpose: payload.purpose,
        version: payload.version,
        proofUri: payload.proofUri || null,
      }),
    },
  })

  return { updated: updated.count }
}

export async function revokeHealthConsent(args: { datasetId: string; tenantId: string; reason?: string; revokedBy: string }) {
  const now = new Date()
  const res = await prisma.$transaction(async (tx) => {
    const ds = await tx.dataset.findFirst({ where: { datasetId: args.datasetId, tenantId: args.tenantId } })
    if (!ds) throw new Error('Dataset not found')

    const upd = await tx.dataset.update({
      where: { id: ds.id },
      data: {
        consentStatus: PrismaConsentStatus.REVOKED,
        consentProofUri: null,
        consentProofHash: null,
      },
    })

    const leases = await tx.accessLease.updateMany({
      where: { datasetId: ds.id, status: PrismaLeaseStatus.ACTIVE },
      data: { status: PrismaLeaseStatus.REVOKED, revokedAt: now, revokedReason: args.reason || 'lgpd_revoke' },
    })

    await tx.auditLog.create({
      data: {
        tenantId: args.tenantId,
        action: 'LGPD_HEALTH_CONSENT_REVOKED',
        resourceType: 'DATASET',
        resourceId: args.datasetId,
        metadata: JSON.stringify({ reason: args.reason || null, revokedBy: args.revokedBy, leasesRevoked: leases.count }),
      },
    })

    return { datasetId: args.datasetId, leasesRevoked: leases.count, status: upd.consentStatus }
  })

  return res
}
