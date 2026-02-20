/**
 * Storage Service Tests
 * Comprehensive tests for storage tracking and billing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StorageService } from '@/lib/billing/storage-service'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    dataset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    accessLease: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
    zadd: vi.fn(),
    zrangebyscore: vi.fn(() => []),
    expire: vi.fn(),
  })),
}))

describe('StorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSnapshot', () => {
    it('should create a storage snapshot with correct GB calculation', async () => {
      const tenantId = 'tenant_123'
      const datasetId = 'dataset_456'
      const storageBytes = BigInt(10737418240) // 10 GB

      const snapshot = await StorageService.createSnapshot({
        tenantId,
        datasetId,
        storageBytes,
        snapshotType: 'PERIODIC',
        hoursInPeriod: 1.0,
      })

      expect(snapshot.tenantId).toBe(tenantId)
      expect(snapshot.datasetId).toBe(datasetId)
      expect(snapshot.storageGb).toBe(10)
      expect(snapshot.gbHours).toBe(10)
      expect(snapshot.snapshotType).toBe('PERIODIC')
    })

    it('should calculate GB-hours correctly for different time periods', async () => {
      const storageBytes = BigInt(5368709120) // 5 GB

      const snapshot = await StorageService.createSnapshot({
        tenantId: 'tenant_123',
        storageBytes,
        hoursInPeriod: 24, // 1 day
      })

      expect(snapshot.storageGb).toBe(5)
      expect(snapshot.gbHours).toBe(120) // 5 GB * 24 hours
    })

    it('should handle lease storage tracking', async () => {
      const snapshot = await StorageService.trackLeaseStorageStart(
        'tenant_123',
        'lease_456',
        'dataset_789',
        BigInt(2147483648) // 2 GB
      )

      expect(snapshot.leaseId).toBe('lease_456')
      expect(snapshot.snapshotType).toBe('LEASE_START')
      expect(snapshot.storageGb).toBe(2)
    })
  })

  describe('calculateGbHours', () => {
    it('should calculate total GB-hours from database', async () => {
      const tenantId = 'tenant_123'
      const start = new Date('2024-01-01')
      const end = new Date('2024-01-31')

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ total: 1000 }])

      const gbHours = await StorageService.calculateGbHours(tenantId, start, end)

      expect(gbHours).toBe(1000)
      expect(prisma.$queryRaw).toHaveBeenCalled()
    })

    it('should filter by dataset when provided', async () => {
      const tenantId = 'tenant_123'
      const datasetId = 'dataset_456'
      const start = new Date('2024-01-01')
      const end = new Date('2024-01-31')

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ total: 500 }])

      const gbHours = await StorageService.calculateGbHours(
        tenantId,
        start,
        end,
        datasetId
      )

      expect(gbHours).toBe(500)
    })
  })

  describe('getUsageSummary', () => {
    it('should return comprehensive usage summary', async () => {
      const tenantId = 'tenant_123'
      const start = new Date('2024-01-01')
      const end = new Date('2024-01-31')

      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          dataset_id: 'dataset_1',
          lease_id: 'lease_1',
          total_gb_hours: 1000,
          avg_storage_gb: 50,
          peak_storage_gb: 100,
          snapshot_count: 720,
        },
        {
          dataset_id: 'dataset_2',
          lease_id: 'lease_2',
          total_gb_hours: 500,
          avg_storage_gb: 25,
          peak_storage_gb: 50,
          snapshot_count: 720,
        },
      ])

      const summary = await StorageService.getUsageSummary(tenantId, start, end)

      expect(summary.totalGbHours).toBe(1500)
      expect(summary.peakStorageGb).toBe(100)
      expect(summary.breakdown.byDataset['dataset_1'].gbHours).toBe(1000)
      expect(summary.breakdown.byDataset['dataset_2'].gbHours).toBe(500)
    })
  })

  describe('getCurrentStorage', () => {
    it('should return current storage metrics', async () => {
      const tenantId = 'tenant_123'

      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          dataset_id: 'dataset_1',
          storage_gb: 50,
          storage_bytes: '53687091200',
          snapshot_timestamp: new Date(),
        },
        {
          dataset_id: 'dataset_2',
          storage_gb: 25,
          storage_bytes: '26843545600',
          snapshot_timestamp: new Date(),
        },
      ])

      const metrics = await StorageService.getCurrentStorage(tenantId)

      expect(metrics.totalStorageGb).toBe(75)
      expect(metrics.datasetCount).toBe(2)
      expect(metrics.datasets).toHaveLength(2)
    })
  })

  describe('calculateStorageCost', () => {
    it('should calculate storage cost correctly', () => {
      const gbHours = 730 // 1 GB for 1 month
      const pricePerGbMonth = 0.023

      const cost = StorageService.calculateStorageCost(gbHours, pricePerGbMonth)

      expect(cost).toBeCloseTo(0.023, 3)
    })

    it('should handle different time periods', () => {
      const gbHours = 365 // 1 GB for half month
      const pricePerGbMonth = 0.023

      const cost = StorageService.calculateStorageCost(gbHours, pricePerGbMonth)

      expect(cost).toBeCloseTo(0.0115, 4)
    })

    it('should use default AWS S3 pricing', () => {
      const gbHours = 730

      const cost = StorageService.calculateStorageCost(gbHours)

      expect(cost).toBeCloseTo(0.023, 3)
    })
  })

  describe('updateDatasetStorage', () => {
    it('should update dataset and create snapshot', async () => {
      const datasetId = 'dataset_123'
      const storageBytes = BigInt(10737418240)

      vi.mocked(prisma.dataset.findUnique).mockResolvedValue({
        id: datasetId,
        tenantId: 'tenant_123',
      } as any)

      vi.mocked(prisma.dataset.update).mockResolvedValue({} as any)

      await StorageService.updateDatasetStorage(datasetId, storageBytes)

      expect(prisma.dataset.update).toHaveBeenCalledWith({
        where: { id: datasetId },
        data: { totalSizeBytes: storageBytes },
      })
    })
  })

  describe('createPeriodicSnapshots', () => {
    it('should create snapshots for all active leases', async () => {
      vi.mocked(prisma.accessLease.findMany).mockResolvedValue([
        {
          id: 'lease_1',
          clientTenantId: 'tenant_1',
          datasetId: 'dataset_1',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 86400000),
          dataset: {
            id: 'dataset_1',
            totalSizeBytes: BigInt(10737418240),
          },
        },
        {
          id: 'lease_2',
          clientTenantId: 'tenant_2',
          datasetId: 'dataset_2',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 86400000),
          dataset: {
            id: 'dataset_2',
            totalSizeBytes: BigInt(5368709120),
          },
        },
      ] as any)

      const count = await StorageService.createPeriodicSnapshots()

      expect(count).toBe(2)
    })
  })
})
