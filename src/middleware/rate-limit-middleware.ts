/**
 * Rate Limiting Middleware
 * Apply rate limits to all API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, releaseConcurrentSlot, isWhitelisted, RateLimitTier } from '@/lib/rate-limiting/advanced-rate-limiter';

/**
 * Rate limit middleware for Next.js API routes
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  getUserTier: (request: NextRequest) => Promise<RateLimitTier>
): Promise<NextResponse | null> {
  const identifier = getIdentifier(request);
  
  // Check whitelist
  if (await isWhitelisted(identifier)) {
    return null; // Allow request
  }

  const tier = await getUserTier(request);
  const endpoint = new URL(request.url).pathname;

  const result = await checkRateLimit(identifier, tier, endpoint);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `You have exceeded the rate limit for your ${tier} tier`,
        tier: result.tier,
        remaining: result.remaining,
        resetAt: result.resetAt,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': getTierLimit(tier).toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetAt.toISOString(),
          'Retry-After': result.retryAfter?.toString() || '60',
        },
      }
    );
  }

  // Add rate limit headers to response
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', getTierLimit(tier).toString());
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', result.resetAt.toISOString());

  // Release concurrent slot after request completes
  request.signal.addEventListener('abort', async () => {
    await releaseConcurrentSlot(identifier);
  });

  return null; // Allow request
}

/**
 * Get identifier from request (IP or user ID)
 */
function getIdentifier(request: NextRequest): string {
  // Try to get user ID from session/token
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    // Extract user ID from JWT or API key
    // For now, use a simple hash of the auth header
    return `user:${hashString(authHeader)}`;
  }

  // Fall back to IP address
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  
  return `ip:${ip}`;
}

/**
 * Get tier limit for headers
 */
function getTierLimit(tier: RateLimitTier): number {
  const limits: Record<RateLimitTier, number> = {
    free: 10,
    starter: 60,
    professional: 300,
    enterprise: 1000,
    unlimited: 10000,
  };
  
  return limits[tier];
}

/**
 * Hash string for identifier
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
