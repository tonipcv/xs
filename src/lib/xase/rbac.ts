/**
 * XASE CORE - RBAC Guards
 * 
 * Utilitários para controle de acesso baseado em papéis (RBAC)
 * e isolamento por tenant
 */

import { prisma } from '@/lib/prisma';

export type XaseRole = 'OWNER' | 'ADMIN' | 'VIEWER';

export interface TenantContext {
  userId: string | null;
  tenantId: string | null;
  role: XaseRole;
}

export class ForbiddenError extends Error {
  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Valida que o usuário tem tenant associado
 * Lança UnauthorizedError se não tiver
 */
export function requireTenant(ctx: TenantContext): asserts ctx is TenantContext & { tenantId: string; userId: string } {
  if (!ctx.userId || !ctx.tenantId) {
    throw new UnauthorizedError('No tenant context found');
  }
}

/**
 * Valida que o usuário tem um dos papéis permitidos
 * Lança ForbiddenError se não tiver
 */
export function requireRole(ctx: TenantContext, allowedRoles: XaseRole[]): void {
  if (!allowedRoles.includes(ctx.role)) {
    throw new ForbiddenError(`Role ${ctx.role} not allowed. Required: ${allowedRoles.join(', ')}`);
  }
}

/**
 * Valida que um recurso pertence ao tenant do usuário
 * Lança ForbiddenError se não pertencer (retorna 404 para evitar information disclosure)
 */
export function assertResourceInTenant<T extends { tenantId: string }>(
  resource: T | null,
  ctx: TenantContext
): asserts resource is T {
  if (!resource) {
    throw new ForbiddenError('Resource not found');
  }
  
  if (resource.tenantId !== ctx.tenantId) {
    throw new ForbiddenError('Resource not found'); // 404-like para não revelar existência
  }
}

/**
 * Registra tentativa de acesso negada no AuditLog
 */
export async function auditDenied(
  ctx: TenantContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  reason: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action,
        resourceType,
        resourceId,
        status: 'DENIED',
        errorMessage: reason,
        metadata: JSON.stringify({
          reason,
          userRole: ctx.role,
          ...metadata,
        }),
      },
    });
  } catch (error) {
    console.error('Failed to audit denied access:', error);
  }
}

/**
 * Wrapper para executar guards e auditar negações
 */
export async function withRBAC<T>(
  ctx: TenantContext,
  allowedRoles: XaseRole[],
  action: string,
  resourceType: string,
  resourceId: string | null,
  fn: () => Promise<T>
): Promise<T> {
  try {
    requireTenant(ctx);
    requireRole(ctx, allowedRoles);
    return await fn();
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
      await auditDenied(
        ctx,
        action,
        resourceType,
        resourceId,
        error.message,
        { allowedRoles }
      );
    }
    throw error;
  }
}
