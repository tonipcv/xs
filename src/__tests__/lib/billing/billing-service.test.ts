/**
 * Billing Service Tests
 * Tests for comprehensive billing with storage, compute, and data processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BillingService } from '@/lib/billing/billing-service'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    creditLedger: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    policyExecution: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('@/lib/billing/storage-service', () => ({
  StorageService: {
    calculateGbHours: vi.fn(() => Promise.resolve(1000)),
    getUsageSummary: vi.fn(() => Promise.resolve({
      breakdown: {
        byDataset: {},
        byLease: {},
      },
    })),
  },
}))

vi.mock('@/lib/billing/metering-service', () => ({
  MeteringService: {
    recordUsage: vi.fn(),
  },
}))

describe('BillingService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateCost', () => {
    it('should calculate total cost with all components', () => {
      const bytesProcessed = BigInt(107374182400) // 100 GB
      const computeHours = 10
      const storageGbHours = 730 // 1 GB for 1 month

      const cost = BillingService.calculateCost(
        bytesProcessed,
        computeHours,
        storageGbHours
      )

      // Expected: (100 * 0.05) + (10 * 0.10) + (730 * 0.000032)
      // = 5.0 + 1.0 + 0.02336 = 6.02336
      expect(cost).toBeCloseTo(6.02336, 4)
    })

    it('should handle zero storage', () => {
      const bytesProcessed = BigInt(10737418240) // 10 GB
      const computeHours = 5
      const storageGbHours = 0

      const cost = BillingService.calculateCost(
        bytesProcessed,
        computeHours,
        storageGbHours
      )

      // Expected: (10 * 0.05) + (5 * 0.10) + 0 = 1.0
      expect(cost).toBeCloseTo(1.0, 2)
    })

    it('should use custom rates when provided', () => {
      const bytesProcessed = BigInt(10737418240) // 10 GB
      const computeHours = 5
      const storageGbHours = 730

      const cost = BillingService.calculateCost(
        bytesProcessed,
        computeHours,
        storageGbHours,
        {
          dataProcessingPerGb: 0.10,
          computePerHour: 0.20,
          storagePerGbHour: 0.00005,
        }
      )

      // Expected: (10 * 0.10) + (5 * 0.20) + (730 * 0.00005)
      // = 1.0 + 1.0 + 0.0365 = 2.0365
      expect(cost).toBeCloseTo(2.0365, 4)
    })
  })

  describe('getMonthlyUsage', () => {
    it('should calculate monthly usage with storage', async () => {
      const tenantId = 'tenant_123'
      const month = new Date('2024-01-01')

      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue([
        {
          id: 'exec_1',
          buyerTenantId: tenantId,
          bytesStreamed: BigInt(10737418240), // 10 GB
          startedAt: new Date('2024-01-15T10:00:00Z'),
          completedAt: new Date('2024-01-15T12:00:00Z'), // 2 hours
          offer: {
            datasetId: 'dataset_1',
          },
        },
        {
          id: 'exec_2',
          buyerTenantId: tenantId,
          bytesStreamed: BigInt(5368709120), // 5 GB
          startedAt: new Date('2024-01-20T14:00:00Z'),
          completedAt: new Date('2024-01-20T17:00:00Z'), // 3 hours
          offer: {
            datasetId: 'dataset_2',
          },
        },
      ] as any)

      const usage = await BillingService.getMonthlyUsage(tenantId, month)

      expect(usage.usage.computeHours).toBe(5) // 2 + 3 hours
      expect(usage.usage.storageGbHours).toBe(1000) // Mocked value
      expect(usage.costs.total).toBeGreaterThan(0)
      expect(usage.costs.storage).toBeGreaterThan(0)
    })

    it('should break down costs by dataset', async () => {
      const tenantId = 'tenant_123'
      const month = new Date('2024-01-01')

      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue([
        {
          id: 'exec_1',
          buyerTenantId: tenantId,
          bytesStreamed: BigInt(10737418240),
          startedAt: new Date('2024-01-15T10:00:00Z'),
          completedAt: new Date('2024-01-15T12:00:00Z'),
          leaseId: 'lease_1',
          offer: {
            datasetId: 'dataset_1',
          },
        },
      ] as any)

      const usage = await BillingService.getMonthlyUsage(tenantId, month)

      expect(usage.breakdown.byDataset['dataset_1']).toBeDefined()
      expect(usage.breakdown.byDataset['dataset_1'].cost).toBeGreaterThan(0)
    })
  })

  describe('generateInvoice', () => {
    it('should generate invoice with itemized charges', async () => {
      const tenantId = 'tenant_123'
      const month = new Date('2024-01-01')

      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue([
        {
          id: 'exec_1',
          buyerTenantId: tenantId,
          bytesStreamed: BigInt(10737418240),
          startedAt: new Date('2024-01-15T10:00:00Z'),
          completedAt: new Date('2024-01-15T12:00:00Z'),
          offer: {
            datasetId: 'dataset_1',
          },
        },
      ] as any)

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any)

      const invoice = await BillingService.generateInvoice(tenantId, month)

      expect(invoice.tenantId).toBe(tenantId)
      expect(invoice.period).toBe('2024-01')
      expect(invoice.status).toBe('PENDING')
      expect(invoice.metadata.itemizedCharges).toBeDefined()
      expect(invoice.metadata.itemizedCharges.length).toBeGreaterThan(0)
      
      // Should have data processing charge
      const dataProcessingCharge = invoice.metadata.itemizedCharges.find(
        c => c.description === 'Data Processing'
      )
      expect(dataProcessingCharge).toBeDefined()

      // Should have storage charge
      const storageCharge = invoice.metadata.itemizedCharges.find(
        c => c.description === 'Storage (GB-hours)'
      )
      expect(storageCharge).toBeDefined()
    })

    it('should set correct due date', async () => {
      const tenantId = 'tenant_123'
      const month = new Date('2024-01-01')

      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue([])
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any)

      const invoice = await BillingService.generateInvoice(tenantId, month)

      expect(invoice.dueDate.getDate()).toBe(15)
      expect(invoice.dueDate.getMonth()).toBe(1) // February (0-indexed)
    })
  })

  describe('getBillingSummary', () => {
    it('should return comprehensive billing summary', async () => {
      const tenantId = 'tenant_123'

      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue([
        {
          id: 'exec_1',
          buyerTenantId: tenantId,
          bytesStreamed: BigInt(10737418240),
          startedAt: new Date(),
          completedAt: new Date(Date.now() + 3600000),
          offer: {
            datasetId: 'dataset_1',
          },
        },
      ] as any)

      vi.mocked(prisma.creditLedger.findMany).mockResolvedValue([
        {
          balanceAfter: 100,
        },
      ] as any)

      const summary = await BillingService.getBillingSummary(tenantId)

      expect(summary.currentMonth).toBeDefined()
      expect(summary.lastMonth).toBeDefined()
      expect(summary.balance).toBe(100)
      expect(summary.upcomingInvoice).toBeDefined()
      expect(summary.trends).toBeDefined()
      expect(summary.trends.storageGrowth).toBeDefined()
      expect(summary.trends.computeGrowth).toBeDefined()
      expect(summary.trends.costGrowth).toBeDefined()
    })
  })

  describe('recordUsage', () => {
    it('should record usage with storage metrics', async () => {
      const tenantId = 'tenant_123'
      const usage = {
        executionId: 'exec_123',
        bytesProcessed: BigInt(10737418240),
        computeHours: 2,
        storageGbHours: 100,
        cost: 1.5,
      }

      vi.mocked(prisma.creditLedger.create).mockResolvedValue({} as any)
      vi.mocked(prisma.creditLedger.findMany).mockResolvedValue([
        { balanceAfter: 50 },
      ] as any)

      await BillingService.recordUsage(tenantId, usage)

      expect(prisma.creditLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          amount: -1.5,
          eventType: 'USAGE',
          metadata: expect.objectContaining({
            executionId: 'exec_123',
            storageGbHours: 100,
          }),
        }),
      })
    })
  })

  describe('getBalance', () => {
    it('should return current balance', async () => {
      const tenantId = 'tenant_123'

      vi.mocked(prisma.creditLedger.findMany).mockResolvedValue([
        {
          balanceAfter: 250.50,
        },
      ] as any)

      const balance = await BillingService.getBalance(tenantId)

      expect(balance).toBe(250.50)
    })

    it('should return 0 for new tenant', async () => {
      const tenantId = 'tenant_new'

      vi.mocked(prisma.creditLedger.findMany).mockResolvedValue([])

      const balance = await BillingService.getBalance(tenantId)

      expect(balance).toBe(0)
    })
  })
})
