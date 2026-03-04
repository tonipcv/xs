/**
 * Policy Engine Real Enforcement Tests
 * Tests for actual policy validation and enforcement
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { validatePolicy, updatePolicyConsumption, logAccess } from '@/lib/xase/policy-engine'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessLease: {
      findUnique: vi.fn(),
    },
    accessPolicy: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    accessLog: {
      create: vi.fn(),
    },
  },
}))

describe('Policy Engine - Real Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validatePolicy - Lease Validation', () => {
    it('should deny access for expired lease', async () => {
      const expiredLease = {
        leaseId: 'lease_123',
        status: 'ACTIVE',
        expiresAt: new Date('2020-01-01'), // Expired
        deletedAt: null,
        policy: {
          id: 'pol_1',
          policyId: 'policy_123',
          status: 'ACTIVE',
          maxHours: 100,
          hoursConsumed: 50,
          maxDownloads: 10,
          downloadsCount: 5,
          expiresAt: new Date('2030-01-01'),
          canStream: true,
          canBatchDownload: true,
        },
      }

      vi.mocked(prisma.accessLease.findUnique).mockResolvedValue(expiredLease as any)

      const result = await validatePolicy({ leaseId: 'lease_123' })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('LEASE_EXPIRED')
      expect(result.reason).toBe('Lease has expired')
    })

    it('should deny access for inactive lease', async () => {
      const inactiveLease = {
        leaseId: 'lease_123',
        status: 'REVOKED',
        expiresAt: new Date('2030-01-01'),
        deletedAt: null,
        policy: {
          id: 'pol_1',
          policyId: 'policy_123',
          status: 'ACTIVE',
          maxHours: 100,
          hoursConsumed: 50,
          maxDownloads: 10,
          downloadsCount: 5,
          expiresAt: new Date('2030-01-01'),
          canStream: true,
          canBatchDownload: true,
        },
      }

      vi.mocked(prisma.accessLease.findUnique).mockResolvedValue(inactiveLease as any)

      const result = await validatePolicy({ leaseId: 'lease_123' })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('LEASE_INACTIVE')
      expect(result.reason).toBe('Lease is revoked')
    })

    it('should deny access for soft-deleted lease', async () => {
      const deletedLease = {
        leaseId: 'lease_123',
        status: 'ACTIVE',
        expiresAt: new Date('2030-01-01'),
        deletedAt: new Date('2025-01-01'),
        policy: {
          id: 'pol_1',
          policyId: 'policy_123',
          status: 'ACTIVE',
          maxHours: 100,
          hoursConsumed: 50,
          maxDownloads: 10,
          downloadsCount: 5,
          expiresAt: new Date('2030-01-01'),
          canStream: true,
          canBatchDownload: true,
        },
      }

      vi.mocked(prisma.accessLease.findUnique).mockResolvedValue(deletedLease as any)

      const result = await validatePolicy({ leaseId: 'lease_123' })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('LEASE_DELETED')
    })

    it('should allow access for valid lease', async () => {
      const validLease = {
        leaseId: 'lease_123',
        status: 'ACTIVE',
        expiresAt: new Date('2030-01-01'),
        deletedAt: null,
        policy: {
          id: 'pol_1',
          policyId: 'policy_123',
          status: 'ACTIVE',
          maxHours: 100,
          hoursConsumed: 50,
          maxDownloads: 10,
          downloadsCount: 5,
          expiresAt: new Date('2030-01-01'),
          canStream: true,
          canBatchDownload: true,
        },
      }

      vi.mocked(prisma.accessLease.findUnique).mockResolvedValue(validLease as any)

      const result = await validatePolicy({ leaseId: 'lease_123' })

      expect(result.allowed).toBe(true)
      expect(result.usage?.hoursRemaining).toBe(50)
      expect(result.usage?.downloadsRemaining).toBe(5)
      expect(result.usage?.utilizationPercent).toBe(50)
    })
  })

  describe('validatePolicy - Policy Limits', () => {
    it('should deny access when hours quota exhausted', async () => {
      const policy = {
        id: 'pol_1',
        policyId: 'policy_123',
        status: 'ACTIVE',
        maxHours: 100,
        hoursConsumed: 100, // Quota exhausted
        maxDownloads: 10,
        downloadsCount: 5,
        expiresAt: new Date('2030-01-01'),
        canStream: true,
        canBatchDownload: true,
      }

      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(policy as any)

      const result = await validatePolicy({ policyId: 'policy_123' })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('QUOTA_EXCEEDED')
      expect(result.reason).toBe('Hours quota exhausted')
    })

    it('should deny access when downloads quota exhausted', async () => {
      const policy = {
        id: 'pol_1',
        policyId: 'policy_123',
        status: 'ACTIVE',
        maxHours: 100,
        hoursConsumed: 50,
        maxDownloads: 10,
        downloadsCount: 10, // Quota exhausted
        expiresAt: new Date('2030-01-01'),
        canStream: true,
        canBatchDownload: true,
      }

      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(policy as any)

      const result = await validatePolicy({ policyId: 'policy_123' })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('QUOTA_EXCEEDED')
      expect(result.reason).toBe('Downloads quota exhausted')
    })

    it('should deny access when requested hours exceed remaining quota', async () => {
      const policy = {
        id: 'pol_1',
        policyId: 'policy_123',
        status: 'ACTIVE',
        maxHours: 100,
        hoursConsumed: 90,
        maxDownloads: 10,
        downloadsCount: 5,
        expiresAt: new Date('2030-01-01'),
        canStream: true,
        canBatchDownload: true,
      }

      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(policy as any)

      const result = await validatePolicy({
        policyId: 'policy_123',
        requestedHours: 20, // Exceeds remaining 10 hours
      })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('QUOTA_INSUFFICIENT')
    })

    it('should deny streaming when not allowed by policy', async () => {
      const policy = {
        id: 'pol_1',
        policyId: 'policy_123',
        status: 'ACTIVE',
        maxHours: 100,
        hoursConsumed: 50,
        maxDownloads: 10,
        downloadsCount: 5,
        expiresAt: new Date('2030-01-01'),
        canStream: false, // Streaming not allowed
        canBatchDownload: true,
      }

      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(policy as any)

      const result = await validatePolicy({
        policyId: 'policy_123',
        action: 'STREAM_ACCESS',
      })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('ACTION_FORBIDDEN')
      expect(result.reason).toBe('Streaming not allowed by policy')
    })

    it('should deny batch download when not allowed by policy', async () => {
      const policy = {
        id: 'pol_1',
        policyId: 'policy_123',
        status: 'ACTIVE',
        maxHours: 100,
        hoursConsumed: 50,
        maxDownloads: 10,
        downloadsCount: 5,
        expiresAt: new Date('2030-01-01'),
        canStream: true,
        canBatchDownload: false, // Download not allowed
      }

      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(policy as any)

      const result = await validatePolicy({
        policyId: 'policy_123',
        action: 'BATCH_DOWNLOAD',
      })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('ACTION_FORBIDDEN')
      expect(result.reason).toBe('Batch download not allowed by policy')
    })

    it('should deny access for expired policy', async () => {
      const policy = {
        id: 'pol_1',
        policyId: 'policy_123',
        status: 'ACTIVE',
        maxHours: 100,
        hoursConsumed: 50,
        maxDownloads: 10,
        downloadsCount: 5,
        expiresAt: new Date('2020-01-01'), // Expired
        canStream: true,
        canBatchDownload: true,
      }

      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(policy as any)

      const result = await validatePolicy({ policyId: 'policy_123' })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('POLICY_EXPIRED')
    })
  })

  describe('validatePolicy - Dataset Access', () => {
    it('should deny access when no active policy found', async () => {
      vi.mocked(prisma.accessPolicy.findMany).mockResolvedValue([])

      const result = await validatePolicy({
        datasetId: 'dataset_123',
        clientTenantId: 'tenant_456',
      })

      expect(result.allowed).toBe(false)
      expect(result.code).toBe('NO_POLICY')
      expect(result.reason).toBe('No active policy found for this dataset')
    })

    it('should allow access when active policy exists', async () => {
      const policies = [
        {
          id: 'pol_1',
          policyId: 'policy_123',
          status: 'ACTIVE',
          maxHours: 100,
          hoursConsumed: 50,
          maxDownloads: 10,
          downloadsCount: 5,
          expiresAt: new Date('2030-01-01'),
          canStream: true,
          canBatchDownload: true,
        },
      ]

      vi.mocked(prisma.accessPolicy.findMany).mockResolvedValue(policies as any)

      const result = await validatePolicy({
        datasetId: 'dataset_123',
        clientTenantId: 'tenant_456',
      })

      expect(result.allowed).toBe(true)
      expect(result.policy?.policyId).toBe('policy_123')
    })
  })

  describe('updatePolicyConsumption', () => {
    it('should increment hours consumed', async () => {
      await updatePolicyConsumption({
        policyId: 'policy_123',
        hoursConsumed: 5,
      })

      expect(prisma.accessPolicy.update).toHaveBeenCalledWith({
        where: { policyId: 'policy_123' },
        data: {
          lastAccessAt: expect.any(Date),
          hoursConsumed: { increment: 5 },
        },
      })
    })

    it('should increment downloads count', async () => {
      await updatePolicyConsumption({
        policyId: 'policy_123',
        downloadsCount: 1,
      })

      expect(prisma.accessPolicy.update).toHaveBeenCalledWith({
        where: { policyId: 'policy_123' },
        data: {
          lastAccessAt: expect.any(Date),
          downloadsCount: { increment: 1 },
        },
      })
    })
  })

  describe('logAccess', () => {
    it('should log granted access', async () => {
      await logAccess(
        {
          datasetId: 'dataset_123',
          policyId: 'policy_123',
          clientTenantId: 'tenant_456',
          action: 'STREAM_ACCESS',
          filesAccessed: 10,
          hoursAccessed: 2.5,
          ipAddress: '192.168.1.1',
        },
        'GRANTED'
      )

      expect(prisma.accessLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          datasetId: 'dataset_123',
          policyId: 'policy_123',
          clientTenantId: 'tenant_456',
          action: 'STREAM_ACCESS',
          filesAccessed: 10,
          hoursAccessed: 2.5,
          outcome: 'GRANTED',
          ipAddress: '192.168.1.1',
        }),
      })
    })

    it('should log denied access with reason', async () => {
      await logAccess(
        {
          datasetId: 'dataset_123',
          policyId: 'policy_123',
          clientTenantId: 'tenant_456',
          action: 'BATCH_DOWNLOAD',
        },
        'DENIED',
        'Quota exceeded'
      )

      expect(prisma.accessLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: 'DENIED',
          errorMessage: 'Quota exceeded',
        }),
      })
    })
  })
})
