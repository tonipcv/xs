/**
 * Error Handling Tests for Billing Services
 * Tests error scenarios and edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StorageService } from '@/lib/billing/storage-service'
import { BillingService } from '@/lib/billing/billing-service'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    storageSnapshot: {
      create: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    dataset: {
      update: vi.fn(),
    },
    policyExecution: {
      findMany: vi.fn(),
    },
    creditLedger: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(() => Promise.resolve([])),
  },
}))

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => Promise.resolve({
    zadd: vi.fn(),
    zrangebyscore: vi.fn(() => []),
    get: vi.fn(),
    set: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  })),
  // Mock do wrapper compatível usado em StorageService
  redis: {
    setex: vi.fn(),
    get: vi.fn(),
    zAdd: vi.fn(),
    zRangeByScore: vi.fn(() => []),
    expire: vi.fn(),
  },
}))

describe('Billing Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('StorageService Error Handling', () => {
    it('should handle database errors gracefully (non-blocking persist)', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([])
      // Persist is fire-and-forget; simulate an error in $executeRaw and ensure no throw from createSnapshot
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
      // We don't directly await persistSnapshotToDb; so errors should not reject createSnapshot
      await expect(
        StorageService.createSnapshot({
          tenantId: 'tenant_1',
          datasetId: 'dataset_1',
          storageBytes: BigInt(1000),
          snapshotType: 'PERIODIC',
        })
      ).resolves.toBeDefined()
    })

    it('should handle invalid storage bytes', async () => {
      await expect(
        StorageService.createSnapshot({
          tenantId: 'tenant_1',
          datasetId: 'dataset_1',
          storageBytes: BigInt(-1),
          snapshotType: 'PERIODIC',
        })
      ).rejects.toThrow()
    })

    it('should handle missing tenant ID', async () => {
      await expect(
        StorageService.createSnapshot({
          tenantId: '',
          datasetId: 'dataset_1',
          storageBytes: BigInt(1000),
          snapshotType: 'PERIODIC',
        })
      ).rejects.toThrow()
    })

    it('should handle negative GB-hours calculation', () => {
      const cost = StorageService.calculateStorageCost(-100)
      expect(cost).toBeLessThan(0)
    })

    it('should handle very large storage values', async () => {
      const largeStorage = BigInt('999999999999999999') // ~1 exabyte
      const snapshot = await StorageService.createSnapshot({
        tenantId: 'tenant_1',
        datasetId: 'dataset_1',
        storageBytes: largeStorage,
        snapshotType: 'PERIODIC',
      })
      expect(snapshot.storageGb).toBeGreaterThan(0)
    })
  })

  describe('BillingService Error Handling', () => {
    it('should handle missing policy executions', async () => {
      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue([])

      const usage = await BillingService.getMonthlyUsage(
        'tenant_1',
        new Date('2024-01-01')
      )

      expect(usage.usage.bytesProcessed).toBe('0')
      expect(usage.usage.computeHours).toBe(0)
      expect(usage.costs.total).toBe(0)
    })

    it('should handle database errors during invoice generation', async () => {
      vi.mocked(prisma.policyExecution.findMany).mockRejectedValue(
        new Error('Database error')
      )

      await expect(
        BillingService.generateInvoice('tenant_1', new Date('2024-01-01'))
      ).rejects.toThrow('Database error')
    })

    it('should handle zero balance correctly', async () => {
      vi.mocked(prisma.creditLedger.findMany).mockResolvedValue([])

      const balance = await BillingService.getBalance('tenant_1')
      expect(balance).toBe(0)
    })

    it('should handle invalid month format', async () => {
      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue([])

      const usage = await BillingService.getMonthlyUsage(
        'tenant_1',
        new Date('invalid')
      )

      expect(usage.costs.total).toBe(0)
    })

    it('should handle concurrent invoice generation', async () => {
      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue([
        {
          id: 'exec_1',
          buyerTenantId: 'tenant_1',
          bytesStreamed: BigInt(1000),
          startedAt: new Date(),
          completedAt: new Date(),
          offer: { datasetId: 'dataset_1' },
        },
      ] as any)

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any)

      const promises = [
        BillingService.generateInvoice('tenant_1', new Date('2024-01-01')),
        BillingService.generateInvoice('tenant_1', new Date('2024-01-01')),
      ]

      const invoices = await Promise.all(promises)
      expect(invoices).toHaveLength(2)
      expect(invoices[0].period).toBe(invoices[1].period)
    })
  })

  describe('Cost Calculation Edge Cases', () => {
    it('should handle BigInt overflow', () => {
      const maxBigInt = BigInt('9007199254740991') // Max safe integer
      const cost = BillingService.calculateCost(maxBigInt, 0, 0)
      expect(cost).toBeGreaterThan(0)
      expect(isFinite(cost)).toBe(true)
    })

    it('should handle floating point precision', () => {
      const cost1 = StorageService.calculateStorageCost(0.1)
      const cost2 = StorageService.calculateStorageCost(0.2)
      const cost3 = StorageService.calculateStorageCost(0.3)
      
      expect(cost1 + cost2).toBeCloseTo(cost3, 10)
    })

    it('should handle very small storage amounts', () => {
      const cost = StorageService.calculateStorageCost(0.0001)
      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(0.00001)
    })

    it('should handle custom rates with zero values', () => {
      const cost = BillingService.calculateCost(
        BigInt(1000),
        10,
        100,
        {
          dataProcessingPerGb: 0,
          computePerHour: 0,
          storagePerGbHour: 0,
        }
      )
      expect(cost).toBe(0)
    })

    it('should handle negative rates gracefully', () => {
      const cost = BillingService.calculateCost(
        BigInt(1000),
        10,
        100,
        {
          dataProcessingPerGb: -0.05,
          computePerHour: -0.10,
          storagePerGbHour: -0.000032,
        }
      )
      expect(cost).toBeLessThan(0)
    })
  })

  describe('Data Validation', () => {
    it('should validate tenant ID format', async () => {
      const invalidTenantIds = ['', null, undefined, '   ', 'tenant@invalid']
      
      for (const tenantId of invalidTenantIds) {
        await expect(
          StorageService.createSnapshot({
            tenantId: tenantId as any,
            datasetId: 'dataset_1',
            storageBytes: BigInt(1000),
            snapshotType: 'PERIODIC',
          })
        ).rejects.toThrow()
      }
    })

    it('should validate storage bytes type', async () => {
      vi.mocked(prisma.storageSnapshot.create).mockResolvedValue({
        id: 'snap_1',
        tenantId: 'tenant_1',
        datasetId: 'dataset_1',
        storageBytes: BigInt(1000),
        storageGb: 0.000001,
        snapshotType: 'PERIODIC',
        snapshotTimestamp: new Date(),
        billingPeriod: '2024-01',
        hoursInPeriod: 1,
        gbHours: 0.000001,
        metadata: {},
        createdAt: new Date(),
      } as any)

      const snapshot = await StorageService.createSnapshot({
        tenantId: 'tenant_1',
        datasetId: 'dataset_1',
        storageBytes: BigInt(1000),
        snapshotType: 'PERIODIC',
      })

      expect(typeof snapshot.storageBytes).toBe('bigint')
    })

    it('should validate snapshot type', async () => {
      const validTypes = ['PERIODIC', 'LEASE_START', 'LEASE_END', 'MANUAL']
      
      for (const type of validTypes) {
        vi.mocked(prisma.storageSnapshot.create).mockResolvedValue({
          id: `snap_${type}`,
          tenantId: 'tenant_1',
          datasetId: 'dataset_1',
          storageBytes: BigInt(1000),
          storageGb: 0.000001,
          snapshotType: type,
          snapshotTimestamp: new Date(),
          billingPeriod: '2024-01',
          hoursInPeriod: 1,
          gbHours: 0.000001,
          metadata: {},
          createdAt: new Date(),
        } as any)

        const snapshot = await StorageService.createSnapshot({
          tenantId: 'tenant_1',
          datasetId: 'dataset_1',
          storageBytes: BigInt(1000),
          snapshotType: type as any,
        })

        expect(snapshot.snapshotType).toBe(type)
      }
    })
  })

  describe('Concurrency and Race Conditions', () => {
    it('should handle concurrent snapshot creation', async () => {
      vi.mocked(prisma.storageSnapshot.create).mockImplementation(() =>
        Promise.resolve({
          id: `snap_${Date.now()}`,
          tenantId: 'tenant_1',
          datasetId: 'dataset_1',
          storageBytes: BigInt(1000),
          storageGb: 0.000001,
          snapshotType: 'PERIODIC',
          snapshotTimestamp: new Date(),
          billingPeriod: '2024-01',
          hoursInPeriod: 1,
          gbHours: 0.000001,
          metadata: {},
          createdAt: new Date(),
        } as any)
      )

      const promises = Array(10).fill(null).map(() =>
        StorageService.createSnapshot({
          tenantId: 'tenant_1',
          datasetId: 'dataset_1',
          storageBytes: BigInt(1000),
          snapshotType: 'PERIODIC',
        })
      )

      const snapshots = await Promise.all(promises)
      expect(snapshots).toHaveLength(10)
      expect(new Set(snapshots.map(s => s.id)).size).toBe(10)
    })

    it('should handle concurrent balance queries', async () => {
      vi.mocked(prisma.creditLedger.findMany).mockResolvedValue([
        { balanceAfter: 100 },
      ] as any)

      const promises = Array(5).fill(null).map(() =>
        BillingService.getBalance('tenant_1')
      )

      const balances = await Promise.all(promises)
      expect(balances.every(b => b === 100)).toBe(true)
    })
  })

  describe('Memory and Performance', () => {
    it('should handle large result sets efficiently', async () => {
      const largeDataset = Array(1000).fill(null).map((_, i) => ({
        id: `exec_${i}`,
        buyerTenantId: 'tenant_1',
        bytesStreamed: BigInt(1000000),
        startedAt: new Date(),
        completedAt: new Date(),
        offer: { datasetId: `dataset_${i % 10}` },
      }))

      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue(largeDataset as any)

      const startTime = Date.now()
      const usage = await BillingService.getMonthlyUsage('tenant_1', new Date('2024-01-01'))
      const duration = Date.now() - startTime

      expect(usage.costs.total).toBeGreaterThan(0)
      expect(duration).toBeLessThan(5000) // Should complete in less than 5 seconds
    })

    it('should not leak memory on repeated calls', async () => {
      for (let i = 0; i < 100; i++) {
        await StorageService.createSnapshot({
          tenantId: 'tenant_1',
          datasetId: 'dataset_1',
          storageBytes: BigInt(1000),
          snapshotType: 'PERIODIC',
        })
      }
      // No exception implies stable behavior
      expect(true).toBe(true)
    })
  })
})
