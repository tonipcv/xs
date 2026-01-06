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
import { generateProofBundle } from '@/lib/xase/export';
import { BundleManifest, finalizeManifest, generateEnhancedVerifyScript } from '@/lib/xase/manifest';
import { hashObject, hashString } from '@/lib/xase/crypto';
import { getKMSProvider } from '@/lib/xase/kms';

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
    const { purpose, description, dateFrom, dateTo } = body;

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

    // Generate bundle manifest synchronously (simplest solution)
    logger.info('bundle.create:generating_manifest', { requestId, tenantId, bundleId });

    // Fetch records for bundle
    const records = await prisma.decisionRecord.findMany({
      where: {
        tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
      },
      orderBy: { timestamp: 'asc' },
      take: 1000, // Limit for performance
    });

    // Build manifest
    const manifest: BundleManifest = {
      version: '1.0.0',
      bundleId,
      generatedAt: new Date().toISOString(),
      tenantId,
      files: [],
      recordCount: records.length,
      purpose,
      legalFormat: 'STANDARD',
      includesSnapshots: false,
      includesPdf: false,
      includesCustodyReport: false,
    };

    // Add decision files to manifest
    for (const record of records) {
      const decisionContent = JSON.stringify({
        transactionId: record.transactionId,
        timestamp: record.timestamp.toISOString(),
        inputHash: record.inputHash,
        outputHash: record.outputHash,
        recordHash: record.recordHash,
        previousHash: record.previousHash,
      }, null, 2);

      manifest.files.push({
        path: `decisions/${record.transactionId}.json`,
        hash: `sha256:${hashString(decisionContent)}`,
        size: Buffer.byteLength(decisionContent, 'utf8'),
        type: 'decision',
      });
    }

    // Add verify script
    const verifyScript = generateEnhancedVerifyScript();
    manifest.files.push({
      path: 'verify.js',
      hash: `sha256:${hashString(verifyScript)}`,
      size: Buffer.byteLength(verifyScript, 'utf8'),
      type: 'verify',
    });

    // Finalize manifest with hash
    const finalManifest = finalizeManifest(manifest);
    const manifestJson = JSON.stringify(finalManifest, null, 2);
    const bundleManifestHash = finalManifest.manifestHash!;

    logger.info('bundle.create:manifest_generated', { requestId, tenantId, bundleId, manifestHash: bundleManifestHash });

    // KMS sign the manifest hash (for legal robustness)
    let kmsSignatureInfo: { signature: string; algorithm: string; keyId: string; timestamp: Date } | null = null;
    try {
      const kms = getKMSProvider();
      const sig = await kms.sign(bundleManifestHash);
      kmsSignatureInfo = sig;
      logger.info('bundle.create:kms_signed', { requestId, tenantId, bundleId, keyId: sig.keyId, algorithm: sig.algorithm });
    } catch (e) {
      logger.warn('bundle.create:kms_sign_skip', { requestId, tenantId, bundleId, error: (e as Error).message });
    }

    // Create bundle record with READY status
    const bundle = await prisma.evidenceBundle.create({
      data: {
        bundleId,
        tenantId,
        status: 'READY',
        recordCount: records.length,
        purpose,
        description,
        createdBy: session.user.email,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        completedAt: new Date(),
        bundleManifestHash,
        legalFormat: 'STANDARD',
        includesPdf: false,
      },
    });

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
          recordCount: records.length,
          dateFrom,
          dateTo,
          manifestHash: bundleManifestHash,
          kmsSignature: kmsSignatureInfo?.signature || null,
          kmsAlgorithm: kmsSignatureInfo?.algorithm || null,
          kmsKeyId: kmsSignatureInfo?.keyId || null,
        }),
      },
    });

    logger.info('bundle.create:success', { requestId, tenantId, bundleId });

    return NextResponse.json({
      success: true,
      bundleId,
      status: 'READY',
      recordCount: records.length,
      manifestHash: bundleManifestHash,
      message: 'Bundle created successfully',
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
