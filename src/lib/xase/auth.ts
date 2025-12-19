/**
 * XASE CORE - API Key Authentication
 * 
 * Middleware para validação de API Keys
 */

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { isValidApiKey } from './crypto';

export interface AuthResult {
  valid: boolean;
  tenantId?: string;
  apiKeyId?: string;
  permissions?: string[];
  error?: string;
}

/**
 * Valida API Key do header X-API-Key
 */
export async function validateApiKey(request: Request | NextRequest): Promise<AuthResult> {
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
  
  if (!apiKey) {
    return { 
      valid: false, 
      error: 'Missing X-API-Key header' 
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
 * Verifica rate limit (implementação básica)
 * TODO: Implementar com Redis para produção
 */
export async function checkRateLimit(
  apiKeyId: string,
  limit: number = 1000
): Promise<{ allowed: boolean; remaining: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const count = await prisma.decisionRecord.count({
    where: {
      tenant: {
        apiKeys: {
          some: {
            id: apiKeyId,
          },
        },
      },
      createdAt: {
        gte: oneHourAgo,
      },
    },
  });
  
  const remaining = Math.max(0, limit - count);
  
  return {
    allowed: count < limit,
    remaining,
  };
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
