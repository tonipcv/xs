// LGPD (saúde) helpers - Art. 11 consent tracking and ROPA scaffolding (MVP)

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

export function buildRopaRecord(input: {
  controller: string
  datasetId: string
  purpose: string
  legalBasis: string
  dataCategories: string[]
  recipients?: string[]
  dpo?: string
  retention?: string
}): ROPARecord {
  return {
    controller: input.controller,
    datasetId: input.datasetId,
    processingPurpose: input.purpose,
    legalBasis: input.legalBasis,
    dataCategories: input.dataCategories,
    recipients: input.recipients,
    dpo: input.dpo,
    retention: input.retention,
  }
}
