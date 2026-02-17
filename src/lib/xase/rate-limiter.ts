/**
 * RATE LIMITER
 * 
 * Advanced rate limiting with multiple strategies:
 * - Fixed window
 * - Sliding window
 * - Token bucket
 * - Per-tenant and per-user limits
 */

import { getRedisClient } from '@/lib/redis'

export interface RateLimitConfig {
  strategy: 'fixed' | 'sliding' | 'token-bucket'
  limit: number
  window: number // seconds
  burst?: number // for token-bucket
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfter?: number // seconds
}

/**
 * Rate Limiter
 */
export class RateLimiter {
  private static readonly REDIS_PREFIX = 'ratelimit:'

  /**
   * Check rate limit
   */
  static async checkLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    switch (config.strategy) {
      case 'fixed':
        return this.checkFixedWindow(key, config)
      case 'sliding':
        return this.checkSlidingWindow(key, config)
      case 'token-bucket':
        return this.checkTokenBucket(key, config)
      default:
        throw new Error(`Unknown strategy: ${config.strategy}`)
    }
  }

  /**
   * Fixed window rate limiting
   */
  private static async checkFixedWindow(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const redis = await getRedisClient()
    const now = Date.now()
    const window = Math.floor(now / (config.window * 1000))
    const redisKey = `${this.REDIS_PREFIX}fixed:${key}:${window}`

    // Increment counter
    const count = await redis.incr(redisKey)

    // Set expiration on first request
    if (count === 1) {
      await redis.expire(redisKey, config.window)
    }

    const allowed = count <= config.limit
    const remaining = Math.max(0, config.limit - count)
    const resetAt = new Date((window + 1) * config.window * 1000)

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000),
    }
  }

  /**
   * Sliding window rate limiting
   */
  private static async checkSlidingWindow(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const redis = await getRedisClient()
    const now = Date.now()
    const windowMs = config.window * 1000
    const redisKey = `${this.REDIS_PREFIX}sliding:${key}`

    // Remove old entries
    await redis.zremrangebyscore(redisKey, 0, now - windowMs)

    // Count entries in window
    const count = await redis.zcard(redisKey)

    const allowed = count < config.limit

    if (allowed) {
      // Add new entry
      await redis.zadd(redisKey, now, `${now}:${Math.random()}`)
      await redis.expire(redisKey, config.window)
    }

    const remaining = Math.max(0, config.limit - count - (allowed ? 1 : 0))
    const resetAt = new Date(now + windowMs)

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil(windowMs / 1000),
    }
  }

  /**
   * Token bucket rate limiting
   */
  private static async checkTokenBucket(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const redis = await getRedisClient()
    const now = Date.now()
    const redisKey = `${this.REDIS_PREFIX}bucket:${key}`
    const burst = config.burst || config.limit

    // Get current bucket state
    const data = await redis.get(redisKey)
    let tokens = burst
    let lastRefill = now

    if (data) {
      const state = JSON.parse(data)
      tokens = state.tokens
      lastRefill = state.lastRefill

      // Refill tokens based on time elapsed
      const elapsed = (now - lastRefill) / 1000
      const refillAmount = (elapsed / config.window) * config.limit
      tokens = Math.min(burst, tokens + refillAmount)
    }

    const allowed = tokens >= 1

    if (allowed) {
      tokens -= 1
    }

    // Save state
    await redis.setex(
      redisKey,
      config.window * 2,
      JSON.stringify({ tokens, lastRefill: now })
    )

    const remaining = Math.floor(tokens)
    const resetAt = new Date(now + ((burst - tokens) / config.limit) * config.window * 1000)

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((1 - tokens) / config.limit * config.window),
    }
  }

  /**
   * Reset rate limit for key
   */
  static async resetLimit(key: string): Promise<void> {
    const redis = await getRedisClient()
    const patterns = [
      `${this.REDIS_PREFIX}fixed:${key}:*`,
      `${this.REDIS_PREFIX}sliding:${key}`,
      `${this.REDIS_PREFIX}bucket:${key}`,
    ]

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    }
  }

  /**
   * Get rate limit status without incrementing
   */
  static async getStatus(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const redis = await getRedisClient()
    const now = Date.now()

    switch (config.strategy) {
      case 'fixed': {
        const window = Math.floor(now / (config.window * 1000))
        const redisKey = `${this.REDIS_PREFIX}fixed:${key}:${window}`
        const count = parseInt(await redis.get(redisKey) || '0')
        const remaining = Math.max(0, config.limit - count)
        const resetAt = new Date((window + 1) * config.window * 1000)

        return {
          allowed: count < config.limit,
          remaining,
          resetAt,
        }
      }

      case 'sliding': {
        const redisKey = `${this.REDIS_PREFIX}sliding:${key}`
        const count = await redis.zcard(redisKey)
        const remaining = Math.max(0, config.limit - count)
        const resetAt = new Date(now + config.window * 1000)

        return {
          allowed: count < config.limit,
          remaining,
          resetAt,
        }
      }

      case 'token-bucket': {
        const redisKey = `${this.REDIS_PREFIX}bucket:${key}`
        const data = await redis.get(redisKey)
        const burst = config.burst || config.limit
        let tokens = burst

        if (data) {
          const state = JSON.parse(data)
          const elapsed = (now - state.lastRefill) / 1000
          const refillAmount = (elapsed / config.window) * config.limit
          tokens = Math.min(burst, state.tokens + refillAmount)
        }

        const remaining = Math.floor(tokens)
        const resetAt = new Date(now + ((burst - tokens) / config.limit) * config.window * 1000)

        return {
          allowed: tokens >= 1,
          remaining,
          resetAt,
        }
      }

      default:
        throw new Error(`Unknown strategy: ${config.strategy}`)
    }
  }
}

/**
 * Pre-configured rate limiters
 */
export const RateLimitPresets = {
  // API endpoints
  api: {
    strategy: 'sliding' as const,
    limit: 100,
    window: 60, // 100 requests per minute
  },

  // Authentication
  auth: {
    strategy: 'fixed' as const,
    limit: 5,
    window: 300, // 5 attempts per 5 minutes
  },

  // Data streaming
  streaming: {
    strategy: 'token-bucket' as const,
    limit: 10,
    window: 60,
    burst: 20, // Allow bursts up to 20
  },

  // Admin operations
  admin: {
    strategy: 'sliding' as const,
    limit: 1000,
    window: 60, // 1000 requests per minute
  },
}
