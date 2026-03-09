// Simple in-memory rate limiter for testing
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const whitelist = new Set<string>();
const endpointLimits: Record<string, number> = {
  '/api/datasets': 5,
  '/api/leases': 10,
  default: 10,
};

function getKey(identifier: string, endpoint?: string): string {
  return endpoint ? `${identifier}:${endpoint}` : identifier;
}

function getWindowMs(): number {
  return 60000; // 1 minute window
}

export class AdvancedRateLimiter {
  async checkLimit(key: string, limit: number, window: number) {
    const now = Date.now();
    const windowMs = window * 1000;
    const record = requestCounts.get(key);
    
    if (!record || now > record.resetTime) {
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    
    if (record.count >= limit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return { allowed: false, remaining: 0, retryAfter };
    }
    
    record.count++;
    return { allowed: true, remaining: limit - record.count };
  }

  async consumeToken(key: string) {
    return { success: true };
  }

  async resetLimit(key: string) {
    requestCounts.delete(key);
    return { success: true };
  }
}

export const rateLimiter = new AdvancedRateLimiter();

export async function getRateLimitStatus(key: string, tier?: string) {
  const now = Date.now();
  const record = requestCounts.get(key);
  const tierLimits: Record<string, number> = {
    free: 10,
    starter: 60,
    professional: 300,
    enterprise: 1000,
  };
  const limit = tierLimits[tier || 'free'] || 10;
  
  if (!record || now > record.resetTime) {
    return {
      tier: tier || 'free',
      limits: { requestsPerMinute: limit },
      current: { requestsThisMinute: 0 },
      remaining: { minute: limit },
    };
  }
  
  return {
    tier: tier || 'free',
    limits: { requestsPerMinute: limit },
    current: { requestsThisMinute: record.count },
    remaining: { minute: Math.max(0, limit - record.count) },
  };
}

export async function checkRateLimit(identifier: string, tier?: string, endpoint?: string) {
  const key = getKey(identifier, endpoint);
  const now = Date.now();
  
  // Get limit based on tier and endpoint
  const tierLimits: Record<string, number> = {
    free: 10,
    starter: 60,
    professional: 300,
    enterprise: 1000,
  };
  
  let limit = tierLimits[tier || 'free'] || 10;
  
  // Apply endpoint-specific stricter limits for free tier
  if (tier === 'free' && endpoint && endpointLimits[endpoint]) {
    limit = Math.min(limit, endpointLimits[endpoint]);
  }
  
  const windowMs = getWindowMs();
  const record = requestCounts.get(key);
  
  if (!record || now > record.resetTime) {
    // New window
    requestCounts.set(key, { count: 1, resetTime: now + windowMs });
    return { 
      allowed: true, 
      remaining: limit - 1,
      tier: tier || 'free',
      retryAfter: 0,
    };
  }
  
  // Check if limit exceeded
  if (record.count >= limit) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { 
      allowed: false, 
      remaining: 0,
      tier: tier || 'free',
      retryAfter: retryAfter > 0 ? retryAfter : 60,
    };
  }
  
  // Increment and allow
  record.count++;
  return { 
    allowed: true, 
    remaining: limit - record.count,
    tier: tier || 'free',
    retryAfter: 0,
  };
}

export async function resetRateLimits(key: string) {
  requestCounts.delete(key);
  return rateLimiter.resetLimit(key);
}

export async function addToWhitelist(key: string) {
  whitelist.add(key);
  return { success: true };
}

export async function isWhitelisted(key: string) {
  return whitelist.has(key);
}
