import { describe, it, expect, beforeEach, vi } from 'vitest'
import { validateApiKey, checkApiRateLimit, hashApiKey } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'
import bcrypt from 'bcryptjs'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}))

describe('Auth Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hashApiKey', () => {
    it('should be defined', () => {
      expect(hashApiKey).toBeDefined()
      expect(typeof hashApiKey).toBe('function')
    })
  })

  describe('validateApiKey', () => {
    it('should be defined and callable', () => {
      expect(validateApiKey).toBeDefined()
      expect(typeof validateApiKey).toBe('function')
    })

    it('should reject invalid API key', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn(() => 'invalid_key'),
        },
      } as any

      vi.mocked(prisma.apiKey.findMany).mockResolvedValue([])

      const result = await validateApiKey(mockRequest)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid API key format')
    })

    it('should reject inactive API key', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn(() => 'xase_pk_test123'),
        },
      } as any

      const mockApiKey = {
        id: 'key_123',
        tenantId: 'tenant_123',
        isActive: false,
        keyHash: await hashApiKey('xase_pk_test123'),
      }

      vi.mocked(prisma.apiKey.findMany).mockResolvedValue([mockApiKey] as any)

      const result = await validateApiKey(mockRequest)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid API key format')
    })

    it('should handle missing API key', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn(() => null),
        },
      } as any

      const result = await validateApiKey(mockRequest)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Missing X-API-Key or Authorization header')
    })
  })

  describe('checkApiRateLimit', () => {
    it('should allow request within rate limit', async () => {
      const mockRedis = {
        incr: vi.fn().mockResolvedValue(5),
        expire: vi.fn().mockResolvedValue(1),
        ttl: vi.fn().mockResolvedValue(60),
      }

      vi.mocked(getRedisClient).mockResolvedValue(mockRedis as any)

      const result = await checkApiRateLimit('key_123', 100, 60)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(95) // 100 - 5
      expect(result.resetAt).toBeGreaterThan(Date.now())
    })

    it('should reject request exceeding rate limit', async () => {
      const mockRedis = {
        incr: vi.fn().mockResolvedValue(101),
        expire: vi.fn().mockResolvedValue(1),
        ttl: vi.fn().mockResolvedValue(60),
      }

      vi.mocked(getRedisClient).mockResolvedValue(mockRedis as any)

      const result = await checkApiRateLimit('key_123', 100, 60)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should fail closed when Redis is unavailable', async () => {
      vi.mocked(getRedisClient).mockRejectedValue(new Error('Redis connection failed'))

      const result = await checkApiRateLimit('key_123', 100, 60)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })
  })
})
