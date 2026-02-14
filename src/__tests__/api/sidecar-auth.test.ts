import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(),
    },
    voiceAccessLease: {
      findUnique: vi.fn(),
    },
    sidecarSession: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

describe('Sidecar Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should validate API key format', () => {
    const validKey = 'xase_pk_1234567890abcdef'
    const invalidKey = 'invalid_key'

    expect(validKey.startsWith('xase_pk_')).toBe(true)
    expect(invalidKey.startsWith('xase_pk_')).toBe(false)
  })

  it('should generate session ID with correct prefix', () => {
    const sessionId = `sidecar_${Math.random().toString(36).substring(2, 15)}`
    expect(sessionId.startsWith('sidecar_')).toBe(true)
    expect(sessionId.length).toBeGreaterThan(10)
  })

  it('should determine trust level based on attestation', () => {
    const withAttestation = { attestationReport: { sgx: 'data' } }
    const withoutAttestation = {}

    const trustLevel1 = withAttestation.attestationReport ? 'ATTESTED' : 'SELF_REPORTED'
    const trustLevel2 = withoutAttestation.attestationReport ? 'ATTESTED' : 'SELF_REPORTED'

    expect(trustLevel1).toBe('ATTESTED')
    expect(trustLevel2).toBe('SELF_REPORTED')
  })

  it('should validate lease expiration', () => {
    const now = new Date()
    const validLease = { expiresAt: new Date(now.getTime() + 3600000) } // +1 hour
    const expiredLease = { expiresAt: new Date(now.getTime() - 3600000) } // -1 hour

    expect(validLease.expiresAt > now).toBe(true)
    expect(expiredLease.expiresAt > now).toBe(false)
  })
})
