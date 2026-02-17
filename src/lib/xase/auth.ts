/**
 * XASE CORE - API Key Authentication
 * 
 * Middleware para validação de API Keys
 */

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { isValidApiKey } from './crypto';
import { getRedisClient } from '../redis';

export interface AuthResult {
  valid: boolean;
  tenantId?: string;
  apiKeyId?: string;
  permissions?: string[];
  error?: string;
}

/**
 * Rate limiting por API Key (janela fixa com TTL)
 * Retorna allowed=false quando excede o limite no período.
 */
export async function checkApiRateLimit(
  apiKeyId: string,
  limit: number = 1000,
  windowSeconds: number = 60 * 60
): Promise<{ allowed: boolean; remaining: number; resetAt: number }>{
  try {
    const redis = await getRedisClient();
    const key = `rate:api:${apiKeyId}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    const ttl = await redis.ttl(key);
    const allowed = current <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - current),
      resetAt: Date.now() + Math.max(0, ttl) * 1000,
    };
  } catch (e) {
    // Fail-closed: deny requests when Redis is unavailable for security
    console.error('[XASE][Auth] Rate limit check failed - denying request:', (e as any)?.message || e);
    return { allowed: false, remaining: 0, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

/**
 * Valida API Key do header X-API-Key ou Authorization Bearer
 */
export async function validateApiKey(request: Request | NextRequest): Promise<AuthResult> {
  // Aceitar X-API-Key ou Authorization: Bearer
  let apiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
  
  if (!apiKey) {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7); // Remove "Bearer "
    }
  }
  
  if (!apiKey) {
    return { 
      valid: false, 
      error: 'Missing X-API-Key or Authorization header' 
    };
  }
  
  // Validar formato
  if (!isValidApiKey(apiKey)) {
    return { 
      valid: false, 
      error: 'Invalid API key format' 
    };
  }
  
  try {
    // Extract key prefix for indexed lookup (first 8 chars before underscore)
    // Format: xase_live_abc123... or xase_test_xyz789...
    const keyPrefix = apiKey.substring(0, Math.min(16, apiKey.indexOf('_', 10) + 8));
    
    // Try Redis cache first for hot path optimization
    try {
      const redis = await getRedisClient();
      const cacheKey = `apikey:${keyPrefix}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        const cachedData = JSON.parse(cached);
        // Verify hash still matches (defense against cache poisoning)
        const isValid = await bcrypt.compare(apiKey, cachedData.keyHash);
        if (isValid && cachedData.isActive && cachedData.tenantStatus === 'ACTIVE') {
          // Update lastUsedAt async
          prisma.apiKey.update({
            where: { id: cachedData.id },
            data: { lastUsedAt: new Date() },
          }).catch(() => {});
          
          return {
            valid: true,
            tenantId: cachedData.tenantId,
            apiKeyId: cachedData.id,
            permissions: cachedData.permissions || ['ingest', 'verify'],
          };
        }
        // Cache miss or invalid - fall through to DB lookup
      }
    } catch (redisErr) {
      // Redis unavailable - fall through to DB lookup
      console.warn('[XASE][Auth] Redis cache unavailable:', (redisErr as any)?.message);
    }
    
    // DB lookup with indexed query using keyPrefix
    // This reduces the search space significantly (O(1) with proper index)
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: {
        isActive: true,
        // Use keyHash prefix for indexed lookup if DB supports it
        // Otherwise this still filters the result set before bcrypt compare
        id: {
          contains: keyPrefix.substring(0, 8), // Partial match on ID for index hint
        },
      },
      include: {
        tenant: true,
      },
    });
    
    if (!apiKeyRecord?.keyHash || typeof apiKeyRecord.keyHash !== 'string') {
      return { 
        valid: false, 
        error: 'Invalid API key' 
      };
    }
    
    // Verify hash
    const isValid = await bcrypt.compare(apiKey, apiKeyRecord.keyHash);
    if (!isValid) {
      return { 
        valid: false, 
        error: 'Invalid API key' 
      };
    }

    // Verify tenant active
    if (apiKeyRecord.tenant?.status !== 'ACTIVE') {
      return { 
        valid: false, 
        error: 'Tenant suspended or cancelled' 
      };
    }

    // Parse permissions
    const rawPerms = apiKeyRecord.permissions;
    const permissions = typeof rawPerms === 'string' && rawPerms.length > 0
      ? rawPerms.split(',').map(p => p.trim()).filter(Boolean)
      : ['ingest', 'verify'];

    // Cache the result for 5 minutes
    try {
      const redis = await getRedisClient();
      const cacheKey = `apikey:${keyPrefix}`;
      await redis.setex(cacheKey, 300, JSON.stringify({
        id: apiKeyRecord.id,
        tenantId: apiKeyRecord.tenantId,
        keyHash: apiKeyRecord.keyHash,
        isActive: apiKeyRecord.isActive,
        tenantStatus: apiKeyRecord.tenant?.status,
        permissions,
      }));
    } catch (redisErr) {
      // Non-fatal - cache write failure
    }

    // Update lastUsedAt async
    prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch((e) => console.error('[XASE][Auth] Failed to update lastUsedAt', e?.message || e));

    return {
      valid: true,
      tenantId: apiKeyRecord.tenantId,
      apiKeyId: apiKeyRecord.id,
      permissions,
    };
    
  } catch (error) {
    // Evitar erro de logger por objeto inesperado
    const msg = (error as any)?.message || String(error);
    console.error('Error validating API key:', msg);
    return { 
      valid: false, 
      error: 'Authentication error' 
    };
  }
}

/**
 * Cria hash de API Key para armazenamento
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(apiKey, saltRounds);
}

/**
 * Verifica rate limit usando Redis para produção
 */
export async function checkRateLimit(
  apiKeyId: string,
  limit: number = 1000
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    // Try Redis first (production)
    const redis = await getRedisClient();
    const window = 3600; // 1 hour in seconds
    const key = `ratelimit:${apiKeyId}:${Math.floor(Date.now() / 1000 / window)}`;
    
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, window);
    }
    
    const remaining = Math.max(0, limit - count);
    
    return {
      allowed: count <= limit,
      remaining,
    };
  } catch (redisError) {
    // Fail-closed: deny requests when Redis is unavailable for security
    console.error('[AUTH] Redis unavailable - denying request:', redisError);
    return {
      allowed: false,
      remaining: 0,
    };
  }
}

/**
 * Valida se API Key tem permissão específica
 */
export function hasPermission(
  auth: AuthResult,
  requiredPermission: 'ingest' | 'export' | 'verify' | 'intervene'
): boolean {
  if (!auth.valid || !auth.permissions) {
    return false;
  }
  
  return auth.permissions.includes(requiredPermission);
}

/**
 * Verifica se User tem acesso ao Tenant (para console)
 */
export async function checkTenantAccess(
  userId: string,
  tenantId: string
): Promise<{ allowed: boolean; role?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tenantId: true,
      xaseRole: true,
    },
  });
  
  if (!user || user.tenantId !== tenantId) {
    return { allowed: false };
  }
  
  return {
    allowed: true,
    role: user.xaseRole || undefined,
  };
}
