/**
 * Advanced Rate Limiting System
 * Per-tenant, per-user, and per-endpoint rate limiting with Redis
 */

import { Redis } from 'ioredis';
import { NextRequest } from 'next/server';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface RateLimitConfig {
  points: number;
  duration: number;
  blockDuration?: number;
}

export interface RateLimitTier {
  FREE: RateLimitConfig;
  INICIANTE: RateLimitConfig;
  PRO: RateLimitConfig;
  ENTERPRISE: RateLimitConfig;
}

// Rate limit configurations per tier
const RATE_LIMITS: Record<string, RateLimitTier> = {
  api: {
    FREE: { points: 10, duration: 60, blockDuration: 300 },
    INICIANTE: { points: 100, duration: 60, blockDuration: 60 },
    PRO: { points: 1000, duration: 60, blockDuration: 30 },
    ENTERPRISE: { points: 10000, duration: 60, blockDuration: 10 },
  },
  upload: {
    FREE: { points: 5, duration: 3600, blockDuration: 3600 },
    INICIANTE: { points: 50, duration: 3600, blockDuration: 1800 },
    PRO: { points: 500, duration: 3600, blockDuration: 900 },
    ENTERPRISE: { points: 5000, duration: 3600, blockDuration: 300 },
  },
  download: {
    FREE: { points: 10, duration: 3600, blockDuration: 3600 },
    INICIANTE: { points: 100, duration: 3600, blockDuration: 1800 },
    PRO: { points: 1000, duration: 3600, blockDuration: 900 },
    ENTERPRISE: { points: 10000, duration: 3600, blockDuration: 300 },
  },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

/**
 * Check rate limit using token bucket algorithm
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowKey = `ratelimit:${key}`;
  const blockKey = `ratelimit:block:${key}`;

  // Check if blocked
  const blocked = await redis.get(blockKey);
  if (blocked) {
    const ttl = await redis.ttl(blockKey);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(now + ttl * 1000),
      retryAfter: ttl,
    };
  }

  // Get current count
  const current = await redis.get(windowKey);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= config.points) {
    // Block if configured
    if (config.blockDuration) {
      await redis.setex(blockKey, config.blockDuration, '1');
    }

    const ttl = await redis.ttl(windowKey);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(now + ttl * 1000),
      retryAfter: ttl,
    };
  }

  // Increment counter
  const multi = redis.multi();
  multi.incr(windowKey);
  if (count === 0) {
    multi.expire(windowKey, config.duration);
  }
  await multi.exec();

  const ttl = await redis.ttl(windowKey);
  return {
    allowed: true,
    remaining: config.points - count - 1,
    resetAt: new Date(now + ttl * 1000),
  };
}

/**
 * Get rate limit config for tenant tier
 */
export function getRateLimitConfig(
  tier: string,
  endpoint: string = 'api'
): RateLimitConfig {
  const limits = RATE_LIMITS[endpoint] || RATE_LIMITS.api;
  return limits[tier as keyof RateLimitTier] || limits.FREE;
}

/**
 * Check rate limit for tenant
 */
export async function checkTenantRateLimit(
  tenantId: string,
  tier: string,
  endpoint: string = 'api'
): Promise<RateLimitResult> {
  const config = getRateLimitConfig(tier, endpoint);
  const key = `tenant:${tenantId}:${endpoint}`;
  return checkRateLimit(key, config);
}

/**
 * Check rate limit for user
 */
export async function checkUserRateLimit(
  userId: string,
  tier: string,
  endpoint: string = 'api'
): Promise<RateLimitResult> {
  const config = getRateLimitConfig(tier, endpoint);
  const key = `user:${userId}:${endpoint}`;
  return checkRateLimit(key, config);
}

/**
 * Check rate limit for IP address
 */
export async function checkIPRateLimit(
  ip: string,
  endpoint: string = 'api'
): Promise<RateLimitResult> {
  const config = { points: 100, duration: 60, blockDuration: 300 };
  const key = `ip:${ip}:${endpoint}`;
  return checkRateLimit(key, config);
}

/**
 * Check rate limit for API key
 */
export async function checkAPIKeyRateLimit(
  apiKey: string,
  tier: string,
  endpoint: string = 'api'
): Promise<RateLimitResult> {
  const config = getRateLimitConfig(tier, endpoint);
  const key = `apikey:${apiKey}:${endpoint}`;
  return checkRateLimit(key, config);
}

/**
 * Middleware helper to check multiple rate limits
 */
export async function checkMultipleRateLimits(
  request: NextRequest,
  tenantId?: string,
  userId?: string,
  tier: string = 'FREE',
  endpoint: string = 'api'
): Promise<RateLimitResult> {
  const results: RateLimitResult[] = [];

  // Check IP rate limit
  const ip = request.headers.get('x-forwarded-for') || 
              request.headers.get('x-real-ip') || 
              'unknown';
  results.push(await checkIPRateLimit(ip, endpoint));

  // Check tenant rate limit
  if (tenantId) {
    results.push(await checkTenantRateLimit(tenantId, tier, endpoint));
  }

  // Check user rate limit
  if (userId) {
    results.push(await checkUserRateLimit(userId, tier, endpoint));
  }

  // Return most restrictive result
  const blocked = results.find(r => !r.allowed);
  if (blocked) {
    return blocked;
  }

  // Return result with minimum remaining
  return results.reduce((min, r) => 
    r.remaining < min.remaining ? r : min
  );
}

/**
 * Get rate limit statistics for tenant
 */
export async function getTenantRateLimitStats(
  tenantId: string
): Promise<Record<string, { current: number; limit: number; resetAt: Date }>> {
  const stats: Record<string, any> = {};
  
  for (const endpoint of Object.keys(RATE_LIMITS)) {
    const key = `ratelimit:tenant:${tenantId}:${endpoint}`;
    const current = await redis.get(key);
    const ttl = await redis.ttl(key);
    
    stats[endpoint] = {
      current: current ? parseInt(current, 10) : 0,
      limit: RATE_LIMITS[endpoint].FREE.points,
      resetAt: new Date(Date.now() + ttl * 1000),
    };
  }
  
  return stats;
}

/**
 * Reset rate limit for key
 */
export async function resetRateLimit(key: string): Promise<void> {
  await redis.del(`ratelimit:${key}`);
  await redis.del(`ratelimit:block:${key}`);
}

/**
 * Get all blocked keys
 */
export async function getBlockedKeys(): Promise<string[]> {
  const keys = await redis.keys('ratelimit:block:*');
  return keys.map(k => k.replace('ratelimit:block:', ''));
}

/**
 * Unblock key
 */
export async function unblockKey(key: string): Promise<void> {
  await redis.del(`ratelimit:block:${key}`);
}
