import { prisma } from '@/lib/prisma';
import { TenantContext } from '@/lib/xase/rbac';

export class RateLimitError extends Error {
  status: number;
  constructor(message = 'Too Many Requests') {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
  }
}

/**
 * Simple per-tenant rate limiter using AuditLog as source of truth.
 * Counts SUCCESS events for a given action within a time window.
 */
export async function assertRateLimit(
  ctx: TenantContext,
  action: 'BUNDLE_CREATE' | 'BUNDLE_DOWNLOAD' | 'BUNDLE_REPROCESS',
  limit: number,
  windowSeconds: number
): Promise<void> {
  if (!ctx.tenantId) throw new RateLimitError('No tenant');

  const since = new Date(Date.now() - windowSeconds * 1000);

  const count = await prisma.auditLog.count({
    where: {
      tenantId: ctx.tenantId,
      action,
      status: 'SUCCESS',
      timestamp: { gt: since },
    },
  });

  if (count >= limit) {
    throw new RateLimitError(`Rate limit exceeded for ${action}: limit ${limit} per ${windowSeconds}s`);
  }
}
