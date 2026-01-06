import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenantContext } from '@/lib/xase/server-auth';
import { randomBytes } from 'crypto';
import { requireTenant, requireRole, auditDenied, ForbiddenError, UnauthorizedError } from '@/lib/xase/rbac';
import { assertRateLimit, RateLimitError } from '@/lib/xase/rate-limit';
import { logger, ensureRequestId } from '@/lib/observability/logger';
import { captureException, captureMessage } from '@/lib/observability/sentry';
import { enqueueJob } from '@/lib/jobs';

export async function POST(request: NextRequest) {
  try {
    const requestId = ensureRequestId(request.headers.get('x-request-id'));
    logger.info('bundle.create:start', { requestId });
    // RBAC: Obter contexto e validar permissões
    const ctx = await getTenantContext();
    
    try {
      requireTenant(ctx);
      requireRole(ctx, ['OWNER', 'ADMIN']);
    } catch (error) {
      logger.warn('bundle.create:rbac_denied', { requestId, tenantId: ctx.tenantId, userId: ctx.userId });
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error instanceof ForbiddenError) {
        await auditDenied(ctx, 'BUNDLE_CREATE', 'EVIDENCE_BUNDLE', null, 'Insufficient permissions', {
          requiredRoles: ['OWNER', 'ADMIN'],
        });
        await captureMessage('BUNDLE_CREATE denied by RBAC', { requestId, tags: { action: 'BUNDLE_CREATE' }, extra: { tenantId: ctx.tenantId, userId: ctx.userId } });
        return NextResponse.json({ error: 'Forbidden: Only OWNER and ADMIN can create bundles' }, { status: 403 });
      }
      throw error;
    }

    const tenantId = ctx.tenantId!;
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { purpose, description, dateFrom, dateTo, packageTitle } = body;

    if (!purpose) {
      return NextResponse.json({ error: 'Purpose is required' }, { status: 400 });
    }

    // Rate limit: 10 creates per hour por tenant
    try {
      await assertRateLimit(ctx, 'BUNDLE_CREATE', 10, 60 * 60);
    } catch (e: any) {
      if (e instanceof RateLimitError) {
        await auditDenied(ctx, 'BUNDLE_CREATE', 'EVIDENCE_BUNDLE', null, e.message, { limit: 10, windowSeconds: 3600 });
        logger.warn('bundle.create:rate_limited', { requestId, tenantId, userId: ctx.userId });
        return NextResponse.json({ error: e.message }, { status: 429 });
      }
      throw e;
    }

    // Generate unique bundle ID
    const bundleId = `bundle_${randomBytes(16).toString('hex')}`;
    logger.info('bundle.create:creating_record', { requestId, tenantId, bundleId, purpose, dateFrom, dateTo });

    // Build date filter for records
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);

    // Count records that will be included
    const recordCount = await prisma.decisionRecord.count({
      where: {
        tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
      },
    });

    if (recordCount === 0) {
      return NextResponse.json(
        { error: 'No records found for the specified date range' },
        { status: 400 }
      );
    }

    // Create bundle record with PENDING status
    const bundle = await prisma.evidenceBundle.create({
      data: {
        bundleId,
        tenantId,
        status: 'PENDING',
        recordCount,
        purpose,
        description,
        createdBy: session.user.email,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        completedAt: null,
        bundleManifestHash: null,
        legalFormat: 'STANDARD',
        includesPdf: false,
      },
    });

    // Enqueue background job
    await enqueueJob('GENERATE_BUNDLE', { bundleId, tenantId, dateFilter, packageTitle }, { dedupeKey: bundleId, maxAttempts: 5 });

    // Log audit event (include IP and User-Agent)
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = request.headers.get('user-agent') || null;
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'BUNDLE_CREATE',
        resourceType: 'EVIDENCE_BUNDLE',
        resourceId: bundleId,
        userId: session.user.email,
        ipAddress,
        userAgent,
        status: 'SUCCESS',
        metadata: JSON.stringify({
          purpose,
          recordCount,
          dateFrom,
          dateTo,
          queued: true,
        }),
      },
    });

    logger.info('bundle.create:success', { requestId, tenantId, bundleId });

    return NextResponse.json({
      success: true,
      bundleId,
      status: 'PENDING',
      recordCount,
      message: 'Bundle enqueued successfully',
    });
  } catch (error) {
    const requestId = ensureRequestId(null);
    logger.error('bundle.create:error', { requestId }, error);
    await captureException(error, { requestId, tags: { action: 'BUNDLE_CREATE' } });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
