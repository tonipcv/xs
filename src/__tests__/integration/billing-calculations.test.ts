/**
 * Billing Calculations Integration Tests
 * Tests for cost calculations and pricing logic
 */

import { describe, it, expect } from 'vitest'
import { BillingService } from '@/lib/billing/billing-service'
import { StorageService } from '@/lib/billing/storage-service'

describe('Billing Calculations Integration', () => {
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

    it('should use default AWS S3 pricing when no rate provided', () => {
      const gbHours = 730 // 1 GB for 1 month
      const cost = StorageService.calculateStorageCost(gbHours)
      
      // Default rate: $0.023/GB-month
      // 730 GB-hours / 730 hours/month = 1 GB-month
      // 1 GB-month * $0.023 = $0.023
      expect(cost).toBeCloseTo(0.023, 4)
    })
  })

  describe('Total Cost Calculations', () => {
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

    it('should calculate costs for enterprise workload', () => {
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

  describe('GB-hours Calculations', () => {
    it('should calculate GB-hours correctly', () => {
      // 10 GB for 5 hours
      const storageGb = 10
      const hours = 5
      const gbHours = storageGb * hours
      
      expect(gbHours).toBe(50)
      
      const cost = StorageService.calculateStorageCost(gbHours)
      expect(cost).toBeCloseTo(0.0016, 4)
    })

    it('should handle fractional GB and hours', () => {
      // 2.5 GB for 3.5 hours
      const storageGb = 2.5
      const hours = 3.5
      const gbHours = storageGb * hours
      
      expect(gbHours).toBe(8.75)
      
      const cost = StorageService.calculateStorageCost(gbHours)
      expect(cost).toBeCloseTo(0.00028, 5)
    })

    it('should calculate monthly GB-hours correctly', () => {
      // 100 GB for full month (730 hours)
      const storageGb = 100
      const hoursInMonth = 730
      const gbHours = storageGb * hoursInMonth
      
      expect(gbHours).toBe(73000)
      
      const cost = StorageService.calculateStorageCost(gbHours)
      // 73000 GB-hours / 730 = 100 GB-months
      // 100 GB-months * $0.023 = $2.30
      expect(cost).toBeCloseTo(2.30, 2)
    })
  })

  describe('Pricing Tiers', () => {
    it('should calculate costs for different storage tiers', () => {
      const gbHours = 730 // 1 GB for 1 month

      // Standard tier (AWS S3 Standard)
      const standardCost = StorageService.calculateStorageCost(gbHours, 0.023)
      expect(standardCost).toBeCloseTo(0.023, 4)

      // Infrequent Access tier (AWS S3 IA)
      const iaCost = StorageService.calculateStorageCost(gbHours, 0.0125)
      expect(iaCost).toBeCloseTo(0.0125, 4)

      // Glacier tier (AWS S3 Glacier)
      const glacierCost = StorageService.calculateStorageCost(gbHours, 0.004)
      expect(glacierCost).toBeCloseTo(0.004, 5)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero bytes processed', () => {
      const cost = BillingService.calculateCost(
        BigInt(0),
        10,
        100
      )
      
      // Only compute and storage costs
      expect(cost).toBeCloseTo(1.0032, 4)
    })

    it('should handle zero compute hours', () => {
      const cost = BillingService.calculateCost(
        BigInt(10737418240), // 10 GB
        0,
        100
      )
      
      // Only data processing and storage costs
      expect(cost).toBeCloseTo(0.5032, 4)
    })

    it('should handle all zeros', () => {
      const cost = BillingService.calculateCost(
        BigInt(0),
        0,
        0
      )
      
      expect(cost).toBe(0)
    })

    it('should handle very large numbers', () => {
      const cost = BillingService.calculateCost(
        BigInt(10737418240000), // 10 TB
        1000,
        730000 // 1 TB for 1 month
      )
      
      // Data: 10000 GB * $0.05 = $500
      // Compute: 1000 hours * $0.10 = $100
      // Storage: 730000 GB-hours * $0.000032 = $23.36
      // Total: $623.36
      expect(cost).toBeCloseTo(623.36, 2)
    })
  })

  describe('Conversion Accuracy', () => {
    it('should convert bytes to GB correctly', () => {
      const bytes = BigInt(1073741824) // 1 GB
      const gb = Number(bytes) / (1024 ** 3)
      
      expect(gb).toBe(1)
    })

    it('should handle BigInt to number conversion', () => {
      const bytes = BigInt(10737418240) // 10 GB
      const gb = Number(bytes) / (1024 ** 3)
      
      expect(gb).toBeCloseTo(10, 2)
    })

    it('should maintain precision in cost calculations', () => {
      // Very small storage amount
      const gbHours = 0.1
      const cost = StorageService.calculateStorageCost(gbHours)
      
      expect(cost).toBeCloseTo(0.0000032, 7)
    })
  })
})
