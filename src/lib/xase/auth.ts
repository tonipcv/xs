// @ts-nocheck
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
    // Fail-open em caso de erro de infra
    return { allowed: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

/**
 * Valida API Key do header X-API-Key ou Authorization Bearer
 */
export async function validateApiKey(request: Request | NextRequest): Promise<AuthResult> {
  // Development-only bypass (no API key). Do NOT enable in production.
  if (process.env.NODE_ENV !== 'production' && process.env.SIDECAR_AUTH_BYPASS === '1') {
    return {
      valid: true,
      tenantId: process.env.DEV_TENANT_ID || 'DEV_TENANT',
      apiKeyId: 'dev-bypass',
      permissions: ['ingest', 'verify'],
    };
  }

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
    // Buscar todas as API keys ativas (comparação via bcrypt)
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        isActive: true,
      },
      include: {
        tenant: true,
      },
    });
    
    // Verificar cada key (bcrypt compare), com proteções
    for (const apiKeyRecord of apiKeys) {
      try {
        if (!apiKeyRecord?.keyHash || typeof apiKeyRecord.keyHash !== 'string') {
          // Registro inválido, ignora
          continue;
        }
        const isValid = await bcrypt.compare(apiKey, apiKeyRecord.keyHash);
        if (!isValid) continue;

        // Verificar tenant ativo
        if (apiKeyRecord.tenant?.status !== 'ACTIVE') {
          return { 
            valid: false, 
            error: 'Tenant suspended or cancelled' 
          };
        }

        // Atualizar lastUsedAt (fire-and-forget)
        prisma.apiKey.update({
          where: { id: apiKeyRecord.id },
          data: { lastUsedAt: new Date() },
        }).catch((e) => console.error('[XASE][Auth] Failed to update lastUsedAt', e?.message || e));

        // Parse permissions com default seguro
        const rawPerms = apiKeyRecord.permissions;
        const permissions = typeof rawPerms === 'string' && rawPerms.length > 0
          ? rawPerms.split(',').map(p => p.trim()).filter(Boolean)
          : ['ingest', 'verify'];

        return {
          valid: true,
          tenantId: apiKeyRecord.tenantId,
          apiKeyId: apiKeyRecord.id,
          permissions,
        };
      } catch (cmpErr) {
        // Se um registro estiver corrompido, ignora e continua
        console.error('[XASE][Auth] compare error (ignored):', (cmpErr as any)?.message || String(cmpErr));
        continue;
      }
    }
    
    return { 
      valid: false, 
      error: 'Invalid API key' 
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
    const redis = getRedisClient();
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
    // Fallback to DB if Redis unavailable
    console.warn('[AUTH] Redis unavailable, falling back to DB rate limit:', redisError);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const count = await prisma.voiceAccessLog.count({
      where: {
        apiKeyId: apiKeyId || undefined,
        timestamp: { gte: oneHourAgo },
      },
    });
    
    const remaining = Math.max(0, limit - count);
    
    return {
      allowed: count < limit,
      remaining,
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
