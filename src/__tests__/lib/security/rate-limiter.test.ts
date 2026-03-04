/**
 * Rate Limiter Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkRateLimit,
  checkTenantRateLimit,
  checkApiKeyRateLimit,
  checkIpRateLimit,
  checkCombinedRateLimit,
} from '@/lib/security/rate-limiter'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    ttl: vi.fn(),
    zRemRangeByScore: vi.fn(),
    zCard: vi.fn(),
    zRange: vi.fn(),
    zAdd: vi.fn(),
    expire: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
    },
    apiKey: {
      findUnique: vi.fn(),
    },
  },
}))

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkRateLimit', () => {
    it('should allow request when under limit', async () => {
      vi.mocked(redis.get).mockResolvedValue(null) // Not blocked
      vi.mocked(redis.zCard).mockResolvedValue(50) // 50 requests in window
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zAdd).mockResolvedValue(1)
      vi.mocked(redis.expire).mockResolvedValue(1)

      const result = await checkRateLimit('test-key', {
        points: 100,
        duration: 60,
      })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(49) // 100 - 50 - 1
    })

    it('should deny request when limit exceeded', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(100) // At limit
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zRange).mockResolvedValue([])

      const result = await checkRateLimit('test-key', {
        points: 100,
        duration: 60,
        blockDuration: 300,
      })

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('should deny request when blocked', async () => {
      vi.mocked(redis.get).mockResolvedValue('1') // Blocked
      vi.mocked(redis.ttl).mockResolvedValue(120) // 2 min remaining

      const result = await checkRateLimit('test-key', {
        points: 100,
        duration: 60,
        blockDuration: 300,
      })

      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBe(120)
    })

    it('should fail open on redis error', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis error'))

      const result = await checkRateLimit('test-key', {
        points: 100,
        duration: 60,
      })

      expect(result.allowed).toBe(true) // Fail open
    })
  })

  describe('checkTenantRateLimit', () => {
    it('should use tenant plan for rate limit', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'tenant_123',
        plan: 'professional',
      } as any)

      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(100)
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zAdd).mockResolvedValue(1)
      vi.mocked(redis.expire).mockResolvedValue(1)

      const result = await checkTenantRateLimit('tenant_123')

      expect(result.allowed).toBe(true)
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 'tenant_123' },
        select: { plan: true },
      })
    })

    it('should default to free plan if tenant not found', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null)

      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(50)
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zAdd).mockResolvedValue(1)
      vi.mocked(redis.expire).mockResolvedValue(1)

      const result = await checkTenantRateLimit('tenant_123')

      expect(result.allowed).toBe(true)
    })
  })

  describe('checkApiKeyRateLimit', () => {
    it('should use API key rate limit', async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        keyHash: 'hash_123',
        rateLimit: 500,
        tenant: {
          plan: 'professional',
        },
      } as any)

      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(100)
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zAdd).mockResolvedValue(1)
      vi.mocked(redis.expire).mockResolvedValue(1)

      const result = await checkApiKeyRateLimit('hash_123')

      expect(result.allowed).toBe(true)
    })

    it('should deny if API key not found', async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null)

      const result = await checkApiKeyRateLimit('invalid_hash')

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })
  })

  describe('checkIpRateLimit', () => {
    it('should enforce IP-based rate limit', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(500)
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zAdd).mockResolvedValue(1)
      vi.mocked(redis.expire).mockResolvedValue(1)

      const result = await checkIpRateLimit('192.168.1.1')

      expect(result.allowed).toBe(true)
    })

    it('should block abusive IPs', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(1000) // At limit
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zRange).mockResolvedValue([])

      const result = await checkIpRateLimit('192.168.1.1')

      expect(result.allowed).toBe(false)
    })
  })

  describe('checkCombinedRateLimit', () => {
    it('should check IP first and deny if exceeded', async () => {
      // IP limit exceeded
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(1000)
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zRange).mockResolvedValue([])

      const result = await checkCombinedRateLimit({
        ip: '192.168.1.1',
        tenantId: 'tenant_123',
      })

      expect(result.allowed).toBe(false)
      // Should not check tenant if IP failed
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled()
    })

    it('should check all limits when IP passes', async () => {
      // IP passes
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(100)
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zAdd).mockResolvedValue(1)
      vi.mocked(redis.expire).mockResolvedValue(1)

      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'tenant_123',
        plan: 'professional',
      } as any)

      const result = await checkCombinedRateLimit({
        ip: '192.168.1.1',
        tenantId: 'tenant_123',
      })

      expect(result.allowed).toBe(true)
      expect(prisma.tenant.findUnique).toHaveBeenCalled()
    })

    it('should check API key if provided', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.zCard).mockResolvedValue(100)
      vi.mocked(redis.zRemRangeByScore).mockResolvedValue(0)
      vi.mocked(redis.zAdd).mockResolvedValue(1)
      vi.mocked(redis.expire).mockResolvedValue(1)

      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        keyHash: 'hash_123',
        rateLimit: 500,
        tenant: {
          plan: 'professional',
        },
      } as any)

      const result = await checkCombinedRateLimit({
        ip: '192.168.1.1',
        apiKeyHash: 'hash_123',
      })

      expect(result.allowed).toBe(true)
      expect(prisma.apiKey.findUnique).toHaveBeenCalled()
    })
  })
})
