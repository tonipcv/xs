/**
 * Health Checker Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HealthChecker } from '@/lib/monitoring/health-checker'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $metrics: {
      json: vi.fn(),
    },
    dataset: {
      aggregate: vi.fn(),
    },
  },
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    setex: vi.fn(),
    get: vi.fn(),
  },
}))

describe('Health Checker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkDatabase', () => {
    it('should return healthy status for fast database', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
      vi.mocked(prisma.$metrics.json).mockResolvedValue({
        counters: [{ key: 'prisma_pool_connections_open', value: 5 }],
      })

      const result = await HealthChecker.checkDatabase()

      expect(result.status).toBe('healthy')
      expect(result.responseTime).toBeLessThan(200)
    })

    it('should return degraded status for slow database', async () => {
      vi.mocked(prisma.$queryRaw).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([{ '?column?': 1 }]), 150))
      )
      vi.mocked(prisma.$metrics.json).mockResolvedValue({ counters: [] })

      const result = await HealthChecker.checkDatabase()

      expect(result.status).toBe('degraded')
      expect(result.responseTime).toBeGreaterThan(100)
    })

    it('should return unhealthy status on database error', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Connection failed'))

      const result = await HealthChecker.checkDatabase()

      expect(result.status).toBe('unhealthy')
      expect(result.message).toBe('Connection failed')
    })
  })

  describe('checkRedis', () => {
    it('should return healthy status for fast Redis', async () => {
      vi.mocked(redis.setex).mockResolvedValue('OK' as any)
      vi.mocked(redis.get).mockResolvedValue('ok')

      const result = await HealthChecker.checkRedis()

      expect(result.status).toBe('healthy')
      expect(result.responseTime).toBeLessThan(100)
    })

    it('should return degraded status for slow Redis', async () => {
      vi.mocked(redis.setex).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('OK' as any), 60))
      )
      vi.mocked(redis.get).mockResolvedValue('ok')

      const result = await HealthChecker.checkRedis()

      expect(result.status).toBe('degraded')
      expect(result.responseTime).toBeGreaterThan(50)
    })

    it('should return unhealthy status on Redis error', async () => {
      vi.mocked(redis.setex).mockRejectedValue(new Error('Redis unavailable'))

      const result = await HealthChecker.checkRedis()

      expect(result.status).toBe('unhealthy')
      expect(result.message).toBe('Redis unavailable')
    })
  })

  describe('checkHealth', () => {
    it('should return overall healthy status', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
      vi.mocked(prisma.$metrics.json).mockResolvedValue({ counters: [] })
      vi.mocked(prisma.dataset.aggregate).mockResolvedValue({
        _sum: { totalSizeBytes: BigInt(1000000) },
        _count: 10,
      } as any)
      vi.mocked(redis.setex).mockResolvedValue('OK' as any)
      vi.mocked(redis.get).mockResolvedValue('ok')

      const result = await HealthChecker.checkHealth()

      expect(result.status).toBe('healthy')
      expect(result.checks.database.status).toBe('healthy')
      expect(result.checks.redis.status).toBe('healthy')
      expect(result.uptime).toBeGreaterThan(0)
    })

    it('should return degraded status if any component is degraded', async () => {
      vi.mocked(prisma.$queryRaw).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([{ '?column?': 1 }]), 150))
      )
      vi.mocked(prisma.$metrics.json).mockResolvedValue({ counters: [] })
      vi.mocked(prisma.dataset.aggregate).mockResolvedValue({
        _sum: { totalSizeBytes: BigInt(1000000) },
        _count: 10,
      } as any)
      vi.mocked(redis.setex).mockResolvedValue('OK' as any)
      vi.mocked(redis.get).mockResolvedValue('ok')

      const result = await HealthChecker.checkHealth()

      expect(result.status).toBe('degraded')
    })

    it('should return unhealthy status if any component is unhealthy', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('DB down'))
      vi.mocked(redis.setex).mockResolvedValue('OK' as any)
      vi.mocked(redis.get).mockResolvedValue('ok')

      const result = await HealthChecker.checkHealth()

      expect(result.status).toBe('unhealthy')
    })
  })

  describe('isReady', () => {
    it('should return true when system is healthy', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
      vi.mocked(prisma.$metrics.json).mockResolvedValue({ counters: [] })
      vi.mocked(prisma.dataset.aggregate).mockResolvedValue({
        _sum: { totalSizeBytes: BigInt(1000000) },
        _count: 10,
      } as any)
      vi.mocked(redis.setex).mockResolvedValue('OK' as any)
      vi.mocked(redis.get).mockResolvedValue('ok')

      const ready = await HealthChecker.isReady()

      expect(ready).toBe(true)
    })

    it('should return false when system is unhealthy', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('DB down'))

      const ready = await HealthChecker.isReady()

      expect(ready).toBe(false)
    })
  })

  describe('isAlive', () => {
    it('should always return true', async () => {
      const alive = await HealthChecker.isAlive()

      expect(alive).toBe(true)
    })
  })

  describe('getMetrics', () => {
    it('should return system metrics', async () => {
      const metrics = await HealthChecker.getMetrics()

      expect(metrics.memory.used).toBeGreaterThan(0)
      expect(metrics.memory.total).toBeGreaterThan(0)
      expect(metrics.memory.percentage).toBeGreaterThanOrEqual(0)
      expect(metrics.memory.percentage).toBeLessThanOrEqual(100)
      expect(metrics.uptime).toBeGreaterThan(0)
    })
  })

  describe('getDiagnostics', () => {
    it('should return comprehensive diagnostics', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
      vi.mocked(prisma.$metrics.json).mockResolvedValue({ counters: [] })
      vi.mocked(prisma.dataset.aggregate).mockResolvedValue({
        _sum: { totalSizeBytes: BigInt(1000000) },
        _count: 10,
      } as any)
      vi.mocked(redis.setex).mockResolvedValue('OK' as any)
      vi.mocked(redis.get).mockResolvedValue('ok')

      const diagnostics = await HealthChecker.getDiagnostics()

      expect(diagnostics.health).toBeDefined()
      expect(diagnostics.metrics).toBeDefined()
      expect(diagnostics.errors).toBeInstanceOf(Array)
      expect(diagnostics.warnings).toBeInstanceOf(Array)
    })

    it('should collect errors from unhealthy components', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('DB error'))
      vi.mocked(redis.setex).mockResolvedValue('OK' as any)
      vi.mocked(redis.get).mockResolvedValue('ok')

      const diagnostics = await HealthChecker.getDiagnostics()

      expect(diagnostics.errors.length).toBeGreaterThan(0)
      expect(diagnostics.errors[0]).toContain('database')
    })
  })

  describe('getStatusSummary', () => {
    it('should return formatted status summary', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
      vi.mocked(prisma.$metrics.json).mockResolvedValue({ counters: [] })
      vi.mocked(prisma.dataset.aggregate).mockResolvedValue({
        _sum: { totalSizeBytes: BigInt(1000000) },
        _count: 10,
      } as any)
      vi.mocked(redis.setex).mockResolvedValue('OK' as any)
      vi.mocked(redis.get).mockResolvedValue('ok')

      const summary = await HealthChecker.getStatusSummary()

      expect(summary.status).toBe('healthy')
      expect(summary.components).toBeDefined()
      expect(summary.components.database).toBe('healthy')
      expect(summary.components.redis).toBe('healthy')
      expect(summary.uptime).toBeDefined()
    })
  })
})
