/**
 * Pricing Service Tests
 * Ensures billing uses negotiated prices instead of defaults
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getNegotiatedPricing,
  calculateCostWithNegotiatedPricing,
  validatePricingConsistency,
} from '@/lib/billing/pricing-service'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessOffer: {
      findUnique: vi.fn(),
    },
    accessPolicy: {
      findUnique: vi.fn(),
    },
    accessLease: {
      findUnique: vi.fn(),
    },
    policyExecution: {
      findMany: vi.fn(),
    },
    creditLedger: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

describe('Pricing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getNegotiatedPricing', () => {
    it('should use offer pricing when available', async () => {
      const mockOffer = {
        pricePerHour: 0.25,
        priceModel: 'PAY_PER_HOUR',
        currency: 'USD',
        status: 'ACTIVE',
      }

      vi.mocked(prisma.accessOffer.findUnique).mockResolvedValue(mockOffer as any)

      const result = await getNegotiatedPricing({
        offerId: 'offer_123',
        tenantId: 'tenant_456',
      })

      expect(result.source).toBe('OFFER')
      expect(result.pricePerHour).toBe(0.25)
      expect(result.offerId).toBe('offer_123')
      expect(result.auditTrail.source).toBe('offer:offer_123')
    })

    it('should use policy pricing when offer not available', async () => {
      vi.mocked(prisma.accessOffer.findUnique).mockResolvedValue(null)

      const mockPolicy = {
        policyId: 'policy_123',
        dataset: {
          accessOffers: [
            {
              id: 'offer_789',
              pricePerHour: 0.15,
              priceModel: 'PAY_PER_HOUR',
              currency: 'USD',
            },
          ],
        },
      }

      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(mockPolicy as any)

      const result = await getNegotiatedPricing({
        policyId: 'policy_123',
        tenantId: 'tenant_456',
      })

      expect(result.source).toBe('POLICY')
      expect(result.pricePerHour).toBe(0.15)
      expect(result.offerId).toBe('offer_789')
    })

    it('should use lease pricing when policy not available', async () => {
      vi.mocked(prisma.accessOffer.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(null)

      const mockLease = {
        leaseId: 'lease_123',
        policy: {
          policyId: 'policy_456',
          dataset: {
            accessOffers: [
              {
                id: 'offer_999',
                pricePerHour: 0.20,
                priceModel: 'PAY_PER_HOUR',
                currency: 'USD',
              },
            ],
          },
        },
      }

      vi.mocked(prisma.accessLease.findUnique).mockResolvedValue(mockLease as any)

      const result = await getNegotiatedPricing({
        leaseId: 'lease_123',
        tenantId: 'tenant_456',
      })

      expect(result.source).toBe('POLICY')
      expect(result.pricePerHour).toBe(0.20)
    })

    it('should fall back to default pricing when no negotiated price found', async () => {
      vi.mocked(prisma.accessOffer.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.accessPolicy.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.accessLease.findUnique).mockResolvedValue(null)

      const result = await getNegotiatedPricing({
        tenantId: 'tenant_456',
      })

      expect(result.source).toBe('DEFAULT')
      expect(result.pricePerHour).toBe(0.10)
      expect(result.auditTrail.source).toBe('default')
    })

    it('should not use inactive offer pricing', async () => {
      const mockOffer = {
        pricePerHour: 0.25,
        priceModel: 'PAY_PER_HOUR',
        currency: 'USD',
        status: 'EXPIRED', // Inactive
      }

      vi.mocked(prisma.accessOffer.findUnique).mockResolvedValue(mockOffer as any)

      const result = await getNegotiatedPricing({
        offerId: 'offer_123',
        tenantId: 'tenant_456',
      })

      // Should fall back to default since offer is inactive
      expect(result.source).toBe('DEFAULT')
    })
  })

  describe('calculateCostWithNegotiatedPricing', () => {
    it('should calculate cost using negotiated pricing', async () => {
      const mockOffer = {
        pricePerHour: 0.25,
        priceModel: 'PAY_PER_HOUR',
        currency: 'USD',
        status: 'ACTIVE',
      }

      vi.mocked(prisma.accessOffer.findUnique).mockResolvedValue(mockOffer as any)

      const result = await calculateCostWithNegotiatedPricing(
        {
          offerId: 'offer_123',
          tenantId: 'tenant_456',
        },
        10 // hours
      )

      expect(result.cost).toBe(2.5) // 10 hours * $0.25/hour
      expect(result.pricing.source).toBe('OFFER')
      expect(result.pricing.pricePerHour).toBe(0.25)
    })

    it('should calculate cost with default pricing when no offer', async () => {
      vi.mocked(prisma.accessOffer.findUnique).mockResolvedValue(null)

      const result = await calculateCostWithNegotiatedPricing(
        {
          tenantId: 'tenant_456',
        },
        10 // hours
      )

      expect(result.cost).toBe(1.0) // 10 hours * $0.10/hour (default)
      expect(result.pricing.source).toBe('DEFAULT')
    })
  })

  describe('validatePricingConsistency', () => {
    it('should detect pricing violations', async () => {
      const mockExecutions = [
        {
          executionId: 'exec_123',
          offer: {
            id: 'offer_123',
            pricePerHour: 0.25,
          },
        },
      ]

      const mockLedgerEntries = [
        {
          tenantId: 'tenant_456',
          metadata: {
            executionId: 'exec_123',
            pricePerHour: 0.10, // Wrong price!
          },
        },
      ]

      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue(mockExecutions as any)
      vi.mocked(prisma.creditLedger.findMany).mockResolvedValue(mockLedgerEntries as any)

      const result = await validatePricingConsistency(
        'tenant_456',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      )

      expect(result.valid).toBe(false)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].expectedPrice).toBe(0.25)
      expect(result.violations[0].actualPrice).toBe(0.10)
    })

    it('should pass when pricing is consistent', async () => {
      const mockExecutions = [
        {
          executionId: 'exec_123',
          offer: {
            id: 'offer_123',
            pricePerHour: 0.25,
          },
        },
      ]

      const mockLedgerEntries = [
        {
          tenantId: 'tenant_456',
          metadata: {
            executionId: 'exec_123',
            pricePerHour: 0.25, // Correct price
          },
        },
      ]

      vi.mocked(prisma.policyExecution.findMany).mockResolvedValue(mockExecutions as any)
      vi.mocked(prisma.creditLedger.findMany).mockResolvedValue(mockLedgerEntries as any)

      const result = await validatePricingConsistency(
        'tenant_456',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      )

      expect(result.valid).toBe(true)
      expect(result.violations).toHaveLength(0)
    })
  })
})
