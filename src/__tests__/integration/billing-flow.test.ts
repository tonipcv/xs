/**
 * Billing Integration Tests
 * End-to-end tests for complete billing flow with storage
 */

import { describe, it, expect, vi } from 'vitest'
import { StorageService } from '@/lib/billing/storage-service'
import { BillingService } from '@/lib/billing/billing-service'

vi.mock('@/lib/prisma')
vi.mock('@/lib/redis', () => ({
  // Minimal mock to satisfy StorageService's usage
  redis: {
    setex: vi.fn(),
    get: vi.fn(),
    zAdd: vi.fn(),
    zRangeByScore: vi.fn(() => []),
    expire: vi.fn(),
  },
}))

describe('Billing Integration Flow', () => {
  const tenantId = 'tenant_integration_test'
  const datasetId = 'dataset_integration_test'
  const leaseId = 'lease_integration_test'

  describe('Complete Billing Cycle', () => {
    it('should track storage from lease start to end', async () => {
      const storageBytes = BigInt(10737418240) // 10 GB
      
      // 1. Create lease start snapshot
      const startSnapshot = await StorageService.trackLeaseStorageStart(
        tenantId,
        leaseId,
        datasetId,
        storageBytes
      )

      expect(startSnapshot.snapshotType).toBe('LEASE_START')
      expect(startSnapshot.storageGb).toBe(10)

      // 2. Simulate 5 hours of usage
      const hoursActive = 5

      // 3. Create lease end snapshot
      mockPrisma.storageSnapshot.create.mockResolvedValueOnce({
        id: 'snapshot_end',
        tenantId,
        datasetId,
        leaseId,
        storageBytes,
        storageGb: 10,
        snapshotType: 'LEASE_END',
        snapshotTimestamp: new Date(),
        billingPeriod: '2024-01',
        hoursInPeriod: hoursActive,
        gbHours: 50,
        metadata: {},
        createdAt: new Date(),
      } as any)

      const endSnapshot = await StorageService.trackLeaseStorageEnd(
        tenantId,
        leaseId,
        datasetId,
        storageBytes,
        hoursActive
      )

      expect(endSnapshot.snapshotType).toBe('LEASE_END')
      expect(endSnapshot.gbHours).toBe(50) // 10 GB * 5 hours
    })

    it('should process sidecar telemetry and calculate costs', async () => {
      mockPrisma.policyExecution.update.mockResolvedValue({} as any)
      
      const telemetry = {
        sessionId: 'session_123',
        leaseId,
        tenantId,
        datasetId,
        bytesProcessed: BigInt(5368709120), // 5 GB
        recordsProcessed: 1000,
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T13:00:00Z'), // 3 hours
        computeSeconds: 10800, // 3 hours
        storageBytes: BigInt(10737418240), // 10 GB
        peakStorageBytes: BigInt(12884901888), // 12 GB
        policiesApplied: ['policy_1', 'policy_2'],
        watermarksApplied: 5,
      }

      const processed = await SidecarTelemetryService.processTelemetry(telemetry)

      expect(processed.usage.computeHours).toBe(3)
      expect(processed.usage.storageGbHours).toBeCloseTo(30, 1) // ~10 GB * 3 hours
      expect(processed.cost.total).toBeGreaterThan(0)
      expect(processed.cost.storage).toBeGreaterThan(0)
      expect(processed.cost.dataProcessing).toBeGreaterThan(0)
      expect(processed.cost.compute).toBeGreaterThan(0)
    })

    it('should generate monthly invoice with storage costs', async () => {
      const month = new Date('2024-01-01')

      // Mock executions data
      mockPrisma.policyExecution.findMany.mockResolvedValue([
        {
          id: 'exec_1',
          buyerTenantId: tenantId,
          bytesStreamed: BigInt(107374182400), // 100 GB
          startedAt: new Date('2024-01-15T10:00:00Z'),
          completedAt: new Date('2024-01-15T20:00:00Z'), // 10 hours
          leaseId,
          offer: {
            datasetId,
          },
        },
      ] as any)

      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      const invoice = await BillingService.generateInvoice(tenantId, month)

      expect(invoice.period).toBe('2024-01')
      expect(invoice.metadata.itemizedCharges).toBeDefined()
      expect(invoice.metadata.itemizedCharges.length).toBeGreaterThan(0)
    })
  })

  describe('Storage Cost Calculations', () => {
    it('should calculate accurate storage costs for different scenarios', () => {
      // Scenario 1: Small dataset, short duration
      const cost1 = StorageService.calculateStorageCost(
        10, // 10 GB-hours
        0.023
      )
      expect(cost1).toBeCloseTo(0.000315, 6)

      // Scenario 2: Large dataset, full month
      const cost2 = StorageService.calculateStorageCost(
        73000, // 100 GB for 1 month (730 hours)
        0.023
      )
      expect(cost2).toBeCloseTo(2.3, 2)

      // Scenario 3: Medium dataset, half month
      const cost3 = StorageService.calculateStorageCost(
        18250, // 50 GB for half month (365 hours)
        0.023
      )
      expect(cost3).toBeCloseTo(0.575, 3)
    })

    it('should calculate total costs with all components', () => {
      const bytesProcessed = BigInt(1073741824000) // 1 TB
      const computeHours = 100
      const storageGbHours = 73000 // 100 GB for 1 month

      const cost = BillingService.calculateCost(
        bytesProcessed,
        computeHours,
        storageGbHours
      )

      // Expected breakdown:
      // Data: 1000 GB * $0.05 = $50
      // Compute: 100 hours * $0.10 = $10
      // Storage: 73000 GB-hours * $0.000032 = $2.336
      // Total: $62.336

      expect(cost).toBeCloseTo(62.336, 2)
    })
  })

  describe('Metering Service Integration', () => {
    it('should record all metric types including storage', async () => {
      mockRedis.zadd.mockResolvedValue(1)

      await MeteringService.recordUsage({
        tenantId,
        leaseId,
        datasetId,
        metric: 'storage_gb_hours',
        value: 100,
        timestamp: new Date(),
        metadata: { source: 'test' },
      })

      expect(mockRedis.zadd).toHaveBeenCalled()
    })

    it('should calculate bills with storage component', async () => {
      const rates = {
        hours: 0.10,
        requests: 0.001,
        bytes: 0.00001,
        storage_gb_hours: 0.000032,
      }

      // Mock usage summary
      mockRedis.zrangebyscore.mockReturnValue([
        JSON.stringify({ value: 100, leaseId, datasetId }),
      ] as any)

      const bill = await MeteringService.calculateBill(
        tenantId,
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        rates
      )

      expect(bill.total).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Periodic Snapshot Creation', () => {
    it('should create hourly snapshots for active leases', async () => {
      mockPrisma.accessLease.findMany.mockResolvedValue([
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
      ] as any)

      const count = await StorageService.createPeriodicSnapshots()

      expect(count).toBeGreaterThan(0)
    })
  })

  describe('Billing Summary Dashboard', () => {
    it('should provide comprehensive billing summary', async () => {
      mockPrisma.policyExecution.findMany.mockResolvedValue([
        {
          id: 'exec_1',
          buyerTenantId: tenantId,
          bytesStreamed: BigInt(10737418240),
          startedAt: new Date(),
          completedAt: new Date(Date.now() + 3600000),
          offer: { datasetId },
        },
      ] as any)

      mockPrisma.creditLedger.findMany.mockResolvedValue([
        { balanceAfter: 100 },
      ] as any)

      const summary = await BillingService.getBillingSummary(tenantId)

      expect(summary.currentMonth.usage.storageGbHours).toBeGreaterThanOrEqual(0)
      expect(summary.currentMonth.costs.storage).toBeGreaterThanOrEqual(0)
      expect(summary.trends.storageGrowth).toBeDefined()
      expect(summary.upcomingInvoice.amount).toBeGreaterThanOrEqual(0)
    })
  })
})
