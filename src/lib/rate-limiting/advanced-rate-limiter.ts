/**
 * Advanced Rate Limiting System
 * Multi-tier, sliding window rate limiting with Redis
 */

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

export type RateLimitTier = 'free' | 'starter' | 'professional' | 'enterprise' | 'unlimited';

export interface RateLimitConfig {
  tier: RateLimitTier;
  limits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
    concurrentRequests: number;
    burstAllowance: number;
  };
  endpoints?: {
    [endpoint: string]: {
      requestsPerMinute: number;
      requestsPerHour: number;
    };
  };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
  tier: RateLimitTier;
}

const TIER_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  free: {
    tier: 'free',
    limits: {
      requestsPerMinute: 10,
      requestsPerHour: 100,
      requestsPerDay: 1000,
      concurrentRequests: 2,
      burstAllowance: 5,
    },
    endpoints: {
      '/api/datasets': { requestsPerMinute: 5, requestsPerHour: 50 },
      '/api/leases': { requestsPerMinute: 3, requestsPerHour: 30 },
    },
  },
  starter: {
    tier: 'starter',
    limits: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      requestsPerDay: 10000,
      concurrentRequests: 5,
      burstAllowance: 20,
    },
    endpoints: {
      '/api/datasets': { requestsPerMinute: 30, requestsPerHour: 500 },
      '/api/leases': { requestsPerMinute: 20, requestsPerHour: 300 },
    },
  },
  professional: {
    tier: 'professional',
    limits: {
      requestsPerMinute: 300,
      requestsPerHour: 10000,
      requestsPerDay: 100000,
      concurrentRequests: 20,
      burstAllowance: 100,
    },
    endpoints: {
      '/api/datasets': { requestsPerMinute: 150, requestsPerHour: 5000 },
      '/api/leases': { requestsPerMinute: 100, requestsPerHour: 3000 },
    },
  },
  enterprise: {
    tier: 'enterprise',
    limits: {
      requestsPerMinute: 1000,
      requestsPerHour: 50000,
      requestsPerDay: 1000000,
      concurrentRequests: 100,
      burstAllowance: 500,
    },
    endpoints: {
      '/api/datasets': { requestsPerMinute: 500, requestsPerHour: 25000 },
      '/api/leases': { requestsPerMinute: 300, requestsPerHour: 15000 },
    },
  },
  unlimited: {
    tier: 'unlimited',
    limits: {
      requestsPerMinute: 10000,
      requestsPerHour: 500000,
      requestsPerDay: 10000000,
      concurrentRequests: 1000,
      burstAllowance: 5000,
    },
  },
};

/**
 * Check rate limit for user/IP
 */
export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier = 'free',
  endpoint?: string
): Promise<RateLimitResult> {
  const config = TIER_CONFIGS[tier];
  
  // Check endpoint-specific limits first
  if (endpoint && config.endpoints?.[endpoint]) {
    const endpointLimit = config.endpoints[endpoint];
    const endpointResult = await checkSlidingWindow(
      `ratelimit:endpoint:${identifier}:${endpoint}`,
      endpointLimit.requestsPerMinute,
      60
    );
    
    if (!endpointResult.allowed) {
      return {
        allowed: false,
        remaining: endpointResult.remaining,
        resetAt: endpointResult.resetAt,
        retryAfter: endpointResult.retryAfter,
        tier,
      };
    }
  }

  // Check per-minute limit
  const minuteResult = await checkSlidingWindow(
    `ratelimit:minute:${identifier}`,
    config.limits.requestsPerMinute,
    60
  );

  if (!minuteResult.allowed) {
    await logRateLimitViolation(identifier, tier, 'minute', endpoint);
    return {
      allowed: false,
      remaining: minuteResult.remaining,
      resetAt: minuteResult.resetAt,
      retryAfter: minuteResult.retryAfter,
      tier,
    };
  }

  // Check per-hour limit
  const hourResult = await checkSlidingWindow(
    `ratelimit:hour:${identifier}`,
    config.limits.requestsPerHour,
    3600
  );

  if (!hourResult.allowed) {
    await logRateLimitViolation(identifier, tier, 'hour', endpoint);
    return {
      allowed: false,
      remaining: hourResult.remaining,
      resetAt: hourResult.resetAt,
      retryAfter: hourResult.retryAfter,
      tier,
    };
  }

  // Check per-day limit
  const dayResult = await checkSlidingWindow(
    `ratelimit:day:${identifier}`,
    config.limits.requestsPerDay,
    86400
  );

  if (!dayResult.allowed) {
    await logRateLimitViolation(identifier, tier, 'day', endpoint);
    return {
      allowed: false,
      remaining: dayResult.remaining,
      resetAt: dayResult.resetAt,
      retryAfter: dayResult.retryAfter,
      tier,
    };
  }

  // Check concurrent requests
  const concurrentKey = `ratelimit:concurrent:${identifier}`;
  const concurrent = await redis.incr(concurrentKey);
  await redis.expire(concurrentKey, 60);

  if (concurrent > config.limits.concurrentRequests) {
    await redis.decr(concurrentKey);
    await logRateLimitViolation(identifier, tier, 'concurrent', endpoint);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60000),
      retryAfter: 60,
      tier,
    };
  }

  // All checks passed
  return {
    allowed: true,
    remaining: Math.min(
      minuteResult.remaining,
      hourResult.remaining,
      dayResult.remaining
    ),
    resetAt: minuteResult.resetAt,
    tier,
  };
}

/**
 * Sliding window rate limit check
 */
async function checkSlidingWindow(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);

  // Count current requests
  const count = await redis.zcard(key);

  if (count >= limit) {
    // Get oldest entry to calculate retry-after
    const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTimestamp = oldest.length > 1 ? parseInt(oldest[1]) : now;
    const resetAt = new Date(oldestTimestamp + windowSeconds * 1000);
    const retryAfter = Math.ceil((resetAt.getTime() - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter,
    };
  }

  // Add current request
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, windowSeconds);

  const resetAt = new Date(now + windowSeconds * 1000);

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt,
  };
}

/**
 * Release concurrent request slot
 */
export async function releaseConcurrentSlot(identifier: string): Promise<void> {
  const concurrentKey = `ratelimit:concurrent:${identifier}`;
  await redis.decr(concurrentKey);
}

/**
 * Get rate limit status
 */
export async function getRateLimitStatus(
  identifier: string,
  tier: RateLimitTier = 'free'
): Promise<{
  tier: RateLimitTier;
  limits: RateLimitConfig['limits'];
  current: {
    requestsThisMinute: number;
    requestsThisHour: number;
    requestsThisDay: number;
    concurrentRequests: number;
  };
  remaining: {
    minute: number;
    hour: number;
    day: number;
  };
}> {
  const config = TIER_CONFIGS[tier];
  const now = Date.now();

  // Get current counts
  const minuteCount = await redis.zcard(`ratelimit:minute:${identifier}`);
  const hourCount = await redis.zcard(`ratelimit:hour:${identifier}`);
  const dayCount = await redis.zcard(`ratelimit:day:${identifier}`);
  const concurrentCount = parseInt(await redis.get(`ratelimit:concurrent:${identifier}`) || '0');

  return {
    tier,
    limits: config.limits,
    current: {
      requestsThisMinute: minuteCount,
      requestsThisHour: hourCount,
      requestsThisDay: dayCount,
      concurrentRequests: concurrentCount,
    },
    remaining: {
      minute: Math.max(0, config.limits.requestsPerMinute - minuteCount),
      hour: Math.max(0, config.limits.requestsPerHour - hourCount),
      day: Math.max(0, config.limits.requestsPerDay - dayCount),
    },
  };
}

/**
 * Reset rate limits for user (admin function)
 */
export async function resetRateLimits(identifier: string): Promise<void> {
  const keys = await redis.keys(`ratelimit:*:${identifier}*`);
  
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  await prisma.auditLog.create({
    data: {
      action: 'RATE_LIMIT_RESET',
      resourceType: 'rate_limit',
      resourceId: identifier,
      metadata: JSON.stringify({ identifier }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });
}

/**
 * Log rate limit violation
 */
async function logRateLimitViolation(
  identifier: string,
  tier: RateLimitTier,
  limitType: string,
  endpoint?: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: 'RATE_LIMIT_EXCEEDED',
      resourceType: 'rate_limit',
      resourceId: identifier,
      metadata: JSON.stringify({
        identifier,
        tier,
        limitType,
        endpoint,
        timestamp: new Date(),
      }),
      status: 'FAILED',
      timestamp: new Date(),
    },
  });
}

/**
 * Get rate limit statistics
 */
export async function getRateLimitStats(
  timeWindowHours: number = 24
): Promise<{
  totalViolations: number;
  violationsByTier: Record<RateLimitTier, number>;
  violationsByType: Record<string, number>;
  topViolators: Array<{ identifier: string; count: number }>;
}> {
  const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

  const violations = await prisma.auditLog.findMany({
    where: {
      action: 'RATE_LIMIT_EXCEEDED',
      timestamp: {
        gte: since,
      },
    },
  });

  const violationsByTier: Record<RateLimitTier, number> = {
    free: 0,
    starter: 0,
    professional: 0,
    enterprise: 0,
    unlimited: 0,
  };

  const violationsByType: Record<string, number> = {};
  const violatorCounts: Record<string, number> = {};

  for (const violation of violations) {
    const metadata = JSON.parse(violation.metadata as string);
    
    violationsByTier[metadata.tier as RateLimitTier]++;
    violationsByType[metadata.limitType] = (violationsByType[metadata.limitType] || 0) + 1;
    violatorCounts[metadata.identifier] = (violatorCounts[metadata.identifier] || 0) + 1;
  }

  const topViolators = Object.entries(violatorCounts)
    .map(([identifier, count]) => ({ identifier, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalViolations: violations.length,
    violationsByTier,
    violationsByType,
    topViolators,
  };
}

/**
 * Apply burst allowance
 */
export async function applyBurstAllowance(
  identifier: string,
  tier: RateLimitTier = 'free'
): Promise<boolean> {
  const config = TIER_CONFIGS[tier];
  const burstKey = `ratelimit:burst:${identifier}`;
  
  const burstUsed = parseInt(await redis.get(burstKey) || '0');
  
  if (burstUsed >= config.limits.burstAllowance) {
    return false;
  }

  await redis.incr(burstKey);
  await redis.expire(burstKey, 3600); // Reset hourly

  return true;
}

/**
 * Whitelist IP/user (bypass rate limits)
 */
export async function addToWhitelist(identifier: string): Promise<void> {
  await redis.sadd('ratelimit:whitelist', identifier);
  
  await prisma.auditLog.create({
    data: {
      action: 'RATE_LIMIT_WHITELIST_ADDED',
      resourceType: 'rate_limit',
      resourceId: identifier,
      metadata: JSON.stringify({ identifier }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });
}

/**
 * Check if identifier is whitelisted
 */
export async function isWhitelisted(identifier: string): Promise<boolean> {
  return (await redis.sismember('ratelimit:whitelist', identifier)) === 1;
}

/**
 * Remove from whitelist
 */
export async function removeFromWhitelist(identifier: string): Promise<void> {
  await redis.srem('ratelimit:whitelist', identifier);
  
  await prisma.auditLog.create({
    data: {
      action: 'RATE_LIMIT_WHITELIST_REMOVED',
      resourceType: 'rate_limit',
      resourceId: identifier,
      metadata: JSON.stringify({ identifier }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });
}
