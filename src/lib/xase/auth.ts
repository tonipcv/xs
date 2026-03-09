// Stub for backward compatibility after Sprint 1 cleanup
// This module was deleted but is still referenced in many routes
// TODO: Refactor routes to use NextAuth directly

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  
  const tenantId = (session.user as any).tenantId;
  
  if (!tenantId) {
    throw new Error('No tenant ID');
  }
  
  return {
    user: session.user,
    tenantId,
  };
}

export async function getAuthUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

export async function getTenantId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.tenantId || null;
}

import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';

export async function validateApiKey(apiKeyOrRequest: string | { headers: { get: (name: string) => string | null } }) {
  // Handle request object
  if (typeof apiKeyOrRequest === 'object') {
    const apiKey = apiKeyOrRequest.headers.get('X-API-Key') || apiKeyOrRequest.headers.get('x-api-key');
    const authHeader = apiKeyOrRequest.headers.get('Authorization');
    
    if (!apiKey && !authHeader) {
      return { valid: false, tenantId: null, error: 'Missing X-API-Key or Authorization header' };
    }
    
    const keyToValidate = apiKey || authHeader?.replace('Bearer ', '');
    if (!keyToValidate || keyToValidate.length < 10) {
      return { valid: false, tenantId: null, error: 'Invalid API key format' };
    }
    
    // Extract raw key from format "xase_8chars_64charsRawKey" (test format)
    let rawKey = keyToValidate;
    if (keyToValidate.includes('_')) {
      const parts = keyToValidate.split('_');
      // Format: xase_8charPrefix_64charRawKey
      if (parts.length >= 3 && parts[0] === 'xase') {
        rawKey = parts.slice(2).join('_'); // Get everything after second underscore (the actual raw key)
      } else if (parts.length >= 2) {
        rawKey = parts.slice(1).join('_'); // Fallback: everything after first underscore
      }
    }
    
    // Validate against database using raw key hash
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
      },
    });
    
    if (!apiKeyRecord) {
      return { valid: false, tenantId: null, error: 'Invalid API key' };
    }
    
    return { valid: true, tenantId: apiKeyRecord.tenantId, userId: apiKeyRecord.tenantId };
  }
  
  // Handle string API key
  if (!apiKeyOrRequest || apiKeyOrRequest.length < 10) {
    return { valid: false, tenantId: null, error: 'Invalid API key format' };
  }
  
  // Extract raw key from format "xase_8chars_64charsRawKey" (test format)
  let rawKey = apiKeyOrRequest;
  if (apiKeyOrRequest.includes('_')) {
    const parts = apiKeyOrRequest.split('_');
    // Format: xase_8charPrefix_64charRawKey
    if (parts.length >= 3 && parts[0] === 'xase') {
      rawKey = parts.slice(2).join('_'); // Get everything after second underscore (the actual raw key)
    } else if (parts.length >= 2) {
      rawKey = parts.slice(1).join('_'); // Fallback: everything after first underscore
    }
  }
  
  // Validate against database using raw key hash
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const apiKeyRecord = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      isActive: true,
    },
  });
  
  if (!apiKeyRecord) {
    return { valid: false, tenantId: null, error: 'Invalid API key' };
  }
  
  return { valid: true, tenantId: apiKeyRecord.tenantId, userId: apiKeyRecord.tenantId };
}

import { getRedisClient } from '@/lib/redis';

export async function checkApiRateLimit(apiKey: string, maxRequests: number = 100, windowMs: number = 60000) {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      // Fail closed: if Redis client not available, deny access
      return { allowed: false, remaining: 0, resetAt: Date.now() };
    }
    
    // Create a key for this API key's rate limit counter
    const key = `ratelimit:${apiKey}`;
    
    // Increment the counter
    const currentCount = await redis.incr(key);
    
    // Set expiry on first request
    if (currentCount === 1) {
      await redis.pexpire(key, windowMs);
    }
    
    // Get TTL for reset time calculation
    const ttl = await redis.ttl(key);
    const resetAt = Date.now() + (ttl * 1000);
    
    // Check if limit exceeded
    if (currentCount > maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }
    
    // Calculate remaining requests
    const remaining = Math.max(0, maxRequests - currentCount);
    
    return { allowed: true, remaining, resetAt };
  } catch {
    // Fail closed: if Redis is unavailable, deny access
    return { allowed: false, remaining: 0, resetAt: Date.now() };
  }
}

export function hashApiKey(apiKey: string) {
  console.warn('API key hashing stubbed');
  return `hashed-${apiKey}`;
}
