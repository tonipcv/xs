/**
 * REAL RATE LIMITING ENFORCEMENT
 * Redis-based rate limiting with tenant isolation
 */

import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

export interface RateLimitConfig {
  points: number
  duration: number
  blockDuration?: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfter?: number
}

// Rate limit tiers based on tenant plan
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: { points: 100, duration: 60, blockDuration: 300 }, // 100 req/min
  starter: { points: 500, duration: 60, blockDuration: 120 }, // 500 req/min
  professional: { points: 2000, duration: 60, blockDuration: 60 }, // 2000 req/min
  enterprise: { points: 10000, duration: 60 }, // 10k req/min, no block
}

/**
 * Check rate limit using sliding window algorithm
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowKey = `ratelimit:${key}`
  const blockKey = `ratelimit:block:${key}`

  try {
    // Check if blocked
    const blocked = await redis.get(blockKey)
    if (blocked) {
      const ttl = await redis.ttl(blockKey)
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(now + ttl * 1000),
        retryAfter: ttl,
      }
    }

    // Get current count in window
    const windowStart = now - config.duration * 1000
    
    // Remove old entries
    await redis.zRemRangeByScore(windowKey, 0, windowStart)
    
    // Count current requests
    const current = await redis.zCard(windowKey)
    
    if (current >= config.points) {
      // Block if configured
      if (config.blockDuration) {
        await redis.setex(blockKey, config.blockDuration, '1')
      }
      
      const oldestScore = await redis.zRange(windowKey, 0, 0, { withScores: true })
      const resetTime = oldestScore.length > 0 
        ? (oldestScore[0] as any).score + config.duration * 1000
        : now + config.duration * 1000
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(resetTime),
        retryAfter: Math.ceil((resetTime - now) / 1000),
      }
    }

    // Add current request
    await redis.zAdd(windowKey, { score: now, value: `${now}:${Math.random()}` })
    await redis.expire(windowKey, config.duration * 2)

    const remaining = config.points - current - 1
    const resetAt = new Date(now + config.duration * 1000)

    return {
      allowed: true,
      remaining,
      resetAt,
    }
  } catch (error) {
    console.error('[RateLimit] Error checking rate limit:', error)
    // Fail open - allow request on error
    return {
      allowed: true,
      remaining: config.points,
      resetAt: new Date(now + config.duration * 1000),
    }
  }
}

/**
 * Check rate limit for tenant
 */
export async function checkTenantRateLimit(
  tenantId: string,
  endpoint?: string
): Promise<RateLimitResult> {
  try {
    // Get tenant plan from database
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    })

    const plan = tenant?.plan || 'free'
    const config = RATE_LIMITS[plan] || RATE_LIMITS.free

    const key = endpoint 
      ? `tenant:${tenantId}:${endpoint}`
      : `tenant:${tenantId}`

    return await checkRateLimit(key, config)
  } catch (error) {
    console.error('[RateLimit] Error checking tenant rate limit:', error)
    // Fail open
    return {
      allowed: true,
      remaining: 100,
      resetAt: new Date(Date.now() + 60000),
    }
  }
}

/**
 * Check rate limit for API key
 */
export async function checkApiKeyRateLimit(
  apiKeyHash: string
): Promise<RateLimitResult> {
  try {
    // Get API key config from database
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: apiKeyHash },
      select: { 
        rateLimit: true,
        tenant: {
          select: { plan: true }
        }
      },
    })

    if (!apiKey) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
      }
    }

    const plan = apiKey.tenant?.plan || 'free'
    const config = RATE_LIMITS[plan] || RATE_LIMITS.free
    
    // Override with API key specific limit if set
    if (apiKey.rateLimit) {
      config.points = apiKey.rateLimit
    }

    const key = `apikey:${apiKeyHash}`
    return await checkRateLimit(key, config)
  } catch (error) {
    console.error('[RateLimit] Error checking API key rate limit:', error)
    // Fail open
    return {
      allowed: true,
      remaining: 100,
      resetAt: new Date(Date.now() + 60000),
    }
  }
}

/**
 * Check rate limit for IP address (global protection)
 */
export async function checkIpRateLimit(
  ip: string
): Promise<RateLimitResult> {
  // Aggressive IP-based limiting to prevent abuse
  const config: RateLimitConfig = {
    points: 1000,
    duration: 60,
    blockDuration: 600, // 10 min block
  }

  const key = `ip:${ip}`
  return await checkRateLimit(key, config)
}

/**
 * Combined rate limit check (IP + Tenant/API Key)
 */
export async function checkCombinedRateLimit(params: {
  ip: string
  tenantId?: string
  apiKeyHash?: string
  endpoint?: string
}): Promise<RateLimitResult> {
  // Check IP first (most restrictive)
  const ipResult = await checkIpRateLimit(params.ip)
  if (!ipResult.allowed) {
    return ipResult
  }

  // Check API key if provided
  if (params.apiKeyHash) {
    const apiKeyResult = await checkApiKeyRateLimit(params.apiKeyHash)
    if (!apiKeyResult.allowed) {
      return apiKeyResult
    }
  }

  // Check tenant if provided
  if (params.tenantId) {
    const tenantResult = await checkTenantRateLimit(params.tenantId, params.endpoint)
    if (!tenantResult.allowed) {
      return tenantResult
    }
  }

  // All checks passed
  return ipResult
}

/**
 * Reset rate limit for key (admin function)
 */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await redis.del(`ratelimit:${key}`)
    await redis.del(`ratelimit:block:${key}`)
  } catch (error) {
    console.error('[RateLimit] Error resetting rate limit:', error)
  }
}

/**
 * Get rate limit stats for tenant
 */
export async function getRateLimitStats(tenantId: string): Promise<{
  current: number
  limit: number
  remaining: number
  resetAt: Date
}> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    })

    const plan = tenant?.plan || 'free'
    const config = RATE_LIMITS[plan] || RATE_LIMITS.free

    const key = `ratelimit:tenant:${tenantId}`
    const now = Date.now()
    const windowStart = now - config.duration * 1000

    await redis.zRemRangeByScore(key, 0, windowStart)
    const current = await redis.zCard(key)

    return {
      current,
      limit: config.points,
      remaining: Math.max(0, config.points - current),
      resetAt: new Date(now + config.duration * 1000),
    }
  } catch (error) {
    console.error('[RateLimit] Error getting rate limit stats:', error)
    return {
      current: 0,
      limit: 100,
      remaining: 100,
      resetAt: new Date(Date.now() + 60000),
    }
  }
}
