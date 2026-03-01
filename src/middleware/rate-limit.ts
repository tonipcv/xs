/**
 * Rate Limiting Middleware
 * Implements token bucket algorithm with Redis
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

let isConnected = false;

async function ensureRedisConnection() {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
  }
}

export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix: string;     // Redis key prefix
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

/**
 * Rate limit based on IP address
 */
export async function rateLimitByIP(
  request: NextRequest,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  
  return rateLimit(ip, config);
}

/**
 * Rate limit based on API key
 */
export async function rateLimitByAPIKey(
  apiKey: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  return rateLimit(apiKey, config);
}

/**
 * Rate limit based on user ID
 */
export async function rateLimitByUser(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  return rateLimit(userId, config);
}

/**
 * Core rate limiting logic using token bucket algorithm
 */
async function rateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    await ensureRedisConnection();

    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Use Redis sorted set for sliding window
    const multi = redisClient.multi();
    
    // Remove old entries outside the window
    multi.zRemRangeByScore(key, 0, windowStart);
    
    // Count requests in current window
    multi.zCard(key);
    
    // Add current request
    multi.zAdd(key, { score: now, value: `${now}` });
    
    // Set expiry on key
    multi.expire(key, Math.ceil(config.windowMs / 1000));
    
    const results = await multi.exec();
    const count = (results?.[1] as number) || 0;

    const allowed = count < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count - 1);
    const resetTime = now + config.windowMs;

    let retryAfter: number | undefined;
    if (!allowed) {
      // Get oldest request in window
      const oldest = await redisClient.zRange(key, 0, 0, { REV: false });
      if (oldest.length > 0) {
        const oldestTime = parseInt(oldest[0]);
        retryAfter = Math.ceil((oldestTime + config.windowMs - now) / 1000);
      }
    }

    return {
      allowed,
      limit: config.maxRequests,
      remaining,
      resetTime,
      retryAfter,
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // Fail open - allow request if Redis is down
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetTime: Date.now() + config.windowMs,
    };
  }
}

/**
 * Apply rate limit and return appropriate response
 */
export async function applyRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const result = await rateLimitByIP(request, config);

  // Add rate limit headers
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', result.limit.toString());
  headers.set('X-RateLimit-Remaining', result.remaining.toString());
  headers.set('X-RateLimit-Reset', result.resetTime.toString());

  if (!result.allowed) {
    if (result.retryAfter) {
      headers.set('Retry-After', result.retryAfter.toString());
    }

    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter || 60} seconds.`,
        limit: result.limit,
        resetTime: result.resetTime,
      },
      {
        status: 429,
        headers,
      }
    );
  }

  return null; // Allow request
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitConfigs = {
  // Authentication endpoints - stricter limits
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyPrefix: 'ratelimit:auth',
  },

  // API endpoints - normal limits
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    keyPrefix: 'ratelimit:api',
  },

  // Free tier
  free: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyPrefix: 'ratelimit:free',
  },

  // Iniciante tier
  iniciante: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50,
    keyPrefix: 'ratelimit:iniciante',
  },

  // Pro tier
  pro: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200,
    keyPrefix: 'ratelimit:pro',
  },

  // Webhook endpoints
  webhooks: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:webhooks',
  },

  // Export endpoints - slower operations
  export: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    keyPrefix: 'ratelimit:export',
  },
};

/**
 * Get rate limit config based on user tier
 */
export function getRateLimitConfigForTier(tier: string): RateLimitConfig {
  switch (tier.toUpperCase()) {
    case 'PRO':
      return RateLimitConfigs.pro;
    case 'INICIANTE':
      return RateLimitConfigs.iniciante;
    case 'FREE':
    default:
      return RateLimitConfigs.free;
  }
}

/**
 * Reset rate limit for a specific identifier
 */
export async function resetRateLimit(
  identifier: string,
  keyPrefix: string
): Promise<void> {
  try {
    await ensureRedisConnection();
    const key = `${keyPrefix}:${identifier}`;
    await redisClient.del(key);
  } catch (error) {
    console.error('Error resetting rate limit:', error);
  }
}

/**
 * Get current rate limit status
 */
export async function getRateLimitStatus(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    await ensureRedisConnection();

    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Remove old entries
    await redisClient.zRemRangeByScore(key, 0, windowStart);

    // Count current requests
    const count = await redisClient.zCard(key);

    const allowed = count < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count);
    const resetTime = now + config.windowMs;

    return {
      allowed,
      limit: config.maxRequests,
      remaining,
      resetTime,
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetTime: Date.now() + config.windowMs,
    };
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (isConnected) {
    await redisClient.quit();
  }
});
