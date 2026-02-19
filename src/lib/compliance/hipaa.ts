// HIPAA Safe Harbor checker (minimal MVP)
// Provides basic detection and redaction suggestions for the 18 identifiers.

import { prisma } from '@/lib/prisma'
export type SafeHarborConfig = {
  dateShiftDays?: number
  redact?: string[]
}

export type SafeHarborFinding = {
  identifier: string
  path?: string
  valuePreview?: string
}

export type SafeHarborReport = {
  passed: boolean
  totalFindings: number
  findings: SafeHarborFinding[]
  redactedCount?: number
}

const IDENTIFIER_PATTERNS: { key: string; regex: RegExp }[] = [
  // 1. Names
  { key: 'Names', regex: /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g },
  // 2. All geographic subdivisions smaller than a state
  { key: 'Geographic', regex: /\b(\d{5})(?:-\d{4})?\b/g }, // zip codes (rough)
  // 3. All elements of dates (except year)
  { key: 'Dates', regex: /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/g },
  // 4. Telephone numbers
  { key: 'Telephone', regex: /\b(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}\b/g },
  // 5. Fax numbers (treated like phone)
  { key: 'Fax', regex: /\b(?:fax[:\s])?\+?\d[\d\s-]{6,}\b/gi },
  // 6. Email addresses
  { key: 'Email', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  // 7. SSN (US)
  { key: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  // 8. Medical record numbers (heuristic)
  { key: 'MRN', regex: /\bMRN[:\s-]?\w+\b/gi },
  // 9. Health plan beneficiary numbers (heuristic)
  { key: 'HPBN', regex: /\b(HPBN|BENEF)[:\s-]?\w+\b/gi },
  // 10. Account numbers
  { key: 'Account', regex: /\bACCT[:\s-]?\w+\b/gi },
  // 11. Certificate/license numbers
  { key: 'License', regex: /\bLIC[:\s-]?\w+\b/gi },
  // 12. Vehicle identifiers
  { key: 'Vehicle', regex: /\bVIN[:\s-]?[A-HJ-NPR-Z0-9]{11,17}\b/gi },
  // 13. Device identifiers/serial numbers
  { key: 'Device', regex: /\bSN[:\s-]?\w+\b/gi },
  // 14. URLs
  { key: 'URL', regex: /https?:\/\/[\w./?=#%-]+/gi },
  // 15. IP addresses
  { key: 'IP', regex: /\b(?:(?:\d{1,3}\.){3}\d{1,3})\b/g },
  // 16. Biometric identifiers (keywords)
  { key: 'Biometric', regex: /\b(fingerprint|retina|iris|voiceprint|faceprint)\b/gi },
  // 17. Full-face photos (keywords)
  { key: 'Photo', regex: /\b(photo|selfie|portrait)\b/gi },
  // 18. Any other unique identifying number
  { key: 'UniqueID', regex: /\bID[:\s-]?\w+\b/gi },
]

export function checkSafeHarbor(payload: unknown, config: SafeHarborConfig = {}): SafeHarborReport {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload || {})
  const findings: SafeHarborFinding[] = []

  for (const pat of IDENTIFIER_PATTERNS) {
    let m: RegExpExecArray | null
    const r = new RegExp(pat.regex)
    while ((m = r.exec(text)) !== null) {
      findings.push({ identifier: pat.key, valuePreview: m[0]?.slice(0, 64) })
      if (findings.length > 2000) break // safety cap
    }
  }

  return {
    passed: findings.length === 0,
    totalFindings: findings.length,
    findings,
  }
}

export async function trackBAA(tenantId: string, partner: string, opts?: {
  effectiveAt?: Date
  expiresAt?: Date | null
  agreementUri?: string | null
  agreementHash?: string | null
}) {
  const record = await prisma.auditLog.create({
    data: {
      tenantId,
      action: 'HIPAA_BAA_SIGNED',
      resourceType: 'TENANT',
      resourceId: tenantId,
      metadata: JSON.stringify({
        partner,
        effectiveAt: (opts?.effectiveAt || new Date()).toISOString(),
        expiresAt: opts?.expiresAt ? opts.expiresAt.toISOString() : null,
        agreementUri: opts?.agreementUri || null,
        agreementHash: opts?.agreementHash || null,
      }),
    },
  })
  return { id: record.id, tenantId, partner, status: 'RECORDED' as const }
}
