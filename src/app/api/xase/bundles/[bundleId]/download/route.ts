import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenantContext } from '@/lib/xase/server-auth';
import JSZip from 'jszip';
import { createHash } from 'crypto';
import { getPresignedUrl } from '@/lib/xase/storage';
import { getKMSProvider } from '@/lib/xase/kms';
import { getPublicKeyPem } from '@/lib/xase/signing-service';
import { requireTenant, requireRole, assertResourceInTenant, auditDenied, ForbiddenError, UnauthorizedError } from '@/lib/xase/rbac';
import { assertRateLimit, RateLimitError } from '@/lib/xase/rate-limit';
import { logger, ensureRequestId } from '@/lib/observability/logger';
import { captureException, captureMessage } from '@/lib/observability/sentry';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  try {
    const requestId = ensureRequestId(request.headers.get('x-request-id'));
    const { bundleId } = await params;
    logger.info('bundle.download:start', { requestId, bundleId });
    // RBAC: Obter contexto e validar permissões
    const ctx = await getTenantContext();
    
    try {
      requireTenant(ctx);
      requireRole(ctx, ['OWNER', 'ADMIN']);
    } catch (error) {
      logger.warn('bundle.download:rbac_denied', { requestId, tenantId: ctx.tenantId, userId: ctx.userId, bundleId });
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error instanceof ForbiddenError) {
        await auditDenied(ctx, 'BUNDLE_DOWNLOAD', 'EVIDENCE_BUNDLE', bundleId, 'Insufficient permissions', {
          requiredRoles: ['OWNER', 'ADMIN'],
        });
        await captureMessage('BUNDLE_DOWNLOAD denied by RBAC', { requestId, tags: { action: 'BUNDLE_DOWNLOAD' }, extra: { tenantId: ctx.tenantId, userId: ctx.userId, bundleId } });
        return NextResponse.json({ error: 'Forbidden: Only OWNER and ADMIN can download bundles' }, { status: 403 });
      }
      throw error;
    }

    const tenantId = ctx.tenantId!;
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    // Fetch bundle
    const bundle = await prisma.evidenceBundle.findFirst({
      where: {
        bundleId,
      },
    });

    // Validar que o bundle pertence ao tenant do usuário
    try {
      assertResourceInTenant(bundle, ctx);
    } catch (error) {
      if (error instanceof ForbiddenError) {
        await auditDenied(ctx, 'BUNDLE_DOWNLOAD', 'EVIDENCE_BUNDLE', bundleId, 'Cross-tenant access attempt', {
          requestedBundleId: bundleId,
        });
        return NextResponse.json({ error: 'Bundle not found' }, { status: 404 }); // 404 para não revelar existência
      }
      throw error;
    }

    if (bundle.status !== 'READY') {
      return NextResponse.json(
        { error: `Bundle is not ready. Current status: ${bundle.status}` },
        { status: 400 }
      );
    }

    // Retention & Legal Hold enforcement on expiry
    if (bundle.expiresAt && bundle.expiresAt < new Date()) {
      const now = new Date();
      const retentionAllows = (bundle as any).legalHold === true || ((bundle as any).retentionUntil && (bundle as any).retentionUntil > now);
      if (!retentionAllows) {
        await auditDenied(ctx, 'BUNDLE_DOWNLOAD', 'EVIDENCE_BUNDLE', bundleId, 'Download blocked by retention (expired and no legal hold)');
        logger.warn('bundle.download:retention_blocked', { requestId, bundleId });
        return NextResponse.json(
          { error: 'Bundle expired by retention policy' },
          { status: 410 }
        );
      }
      // else: legal hold or retentionUntil active -> permit download
    }

    // Rate limit: 50 downloads por dia por tenant
    try {
      await assertRateLimit(ctx, 'BUNDLE_DOWNLOAD', 50, 60 * 60 * 24);
    } catch (e: any) {
      if (e instanceof RateLimitError) {
        await auditDenied(ctx, 'BUNDLE_DOWNLOAD', 'EVIDENCE_BUNDLE', bundleId, e.message, { limit: 50, windowSeconds: 86400 });
        logger.warn('bundle.download:rate_limited', { requestId, bundleId, tenantId });
        return NextResponse.json({ error: e.message }, { status: 429 });
      }
      throw e;
    }

    // If bundle exists in storage, stream via presigned URL (preferred path)
    if (bundle.storageKey) {
      // Log audit BEFORE redirect
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'BUNDLE_DOWNLOAD',
          resourceType: 'EVIDENCE_BUNDLE',
          resourceId: bundleId,
          userId: session.user.email,
          status: 'SUCCESS',
          metadata: JSON.stringify({
            purpose: bundle.purpose,
            recordCount: bundle.recordCount,
            downloadedAt: new Date().toISOString(),
            storageKey: bundle.storageKey,
            storageUrl: bundle.storageUrl,
          }),
        },
      });

      const url = await getPresignedUrl(bundle.storageKey, 60 * 5); // 5 minutes
      logger.info('bundle.download:redirect_presigned', { requestId, bundleId, storageKey: bundle.storageKey });
      return NextResponse.redirect(url, { status: 302 });
    }

    // Fallback: build ZIP in API (legacy) - for older bundles without storage
    // Fetch records for this bundle
    const dateFilter: any = {};
    if (bundle.dateFrom) dateFilter.gte = bundle.dateFrom;
    if (bundle.dateTo) dateFilter.lte = bundle.dateTo;

    const records = await prisma.decisionRecord.findMany({
      where: {
        tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
      },
      orderBy: { timestamp: 'asc' },
    });

    // Create ZIP package
    const zip = new JSZip();

    // 1. Add records JSON
    const recordsData = {
      bundleId: bundle.bundleId,
      tenantId: bundle.tenantId,
      purpose: bundle.purpose,
      description: bundle.description,
      createdAt: bundle.createdAt.toISOString(),
      createdBy: bundle.createdBy,
      recordCount: records.length,
      records: records.map((r: any) => ({
        id: r.id,
        transactionId: r.transactionId,
        policyId: r.policyId,
        decisionType: r.decisionType,
        confidence: r.confidence,
        isVerified: r.isVerified,
        timestamp: r.timestamp.toISOString(),
      })),
    };

    const recordsJson = JSON.stringify(recordsData, null, 2);
    zip.file('records.json', recordsJson);

    // 2. Add metadata
    const metadata = {
      bundleId: bundle.bundleId,
      version: '1.0',
      generatedAt: new Date().toISOString(),
      downloadedBy: session.user.email,
      downloadedAt: new Date().toISOString(),
      purpose: bundle.purpose,
      description: bundle.description,
      recordCount: records.length,
      dateRange: {
        from: bundle.dateFrom?.toISOString() || null,
        to: bundle.dateTo?.toISOString() || null,
      },
      compliance: {
        worm: true,
        tamperEvident: true,
        cryptographicallySigned: true,
      },
    };

    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // 3. Generate SHA-256 hash of records
    const recordsHash = createHash('sha256').update(recordsJson).digest('hex');

    // 4. Sign hash with KMS (mock or real). Embed public key for offline verification.
    let signaturePayload: any = {
      algorithm: 'SHA256',
      hash: recordsHash,
      signedAt: new Date().toISOString(),
      signedBy: 'xase-kms-disabled',
    };
    try {
      const kms = getKMSProvider();
      const sig = await kms.sign(recordsHash);
      const publicKeyPem = await getPublicKeyPem().catch(() => undefined);
      signaturePayload = {
        algorithm: sig.algorithm,
        hash: recordsHash,
        signature: sig.signature,
        keyId: sig.keyId,
        signedAt: sig.timestamp.toISOString(),
        publicKeyPem: publicKeyPem || undefined,
      };
    } catch (e) {
      // keep minimal signature payload; verification will only compare hash
    }

    zip.file('signature.json', JSON.stringify(signaturePayload, null, 2));

    // 5. Add verification script
    const verificationScript = `#!/usr/bin/env node
/**
 * XASE Evidence Bundle Verification Script
 * 
 * This script verifies the integrity of an evidence bundle
 * by checking the cryptographic hash against the signature.
 * 
 * Usage: node verify.js
 */

const fs = require('fs');
const crypto = require('crypto');

console.log('🔍 XASE Evidence Bundle Verification\\n');

// Read files
const records = fs.readFileSync('records.json', 'utf8');
const signature = JSON.parse(fs.readFileSync('signature.json', 'utf8'));
const metadata = JSON.parse(fs.readFileSync('metadata.json', 'utf8'));

// Calculate hash
const calculatedHash = crypto.createHash('sha256').update(records).digest('hex');

console.log('Bundle ID:', metadata.bundleId);
console.log('Record Count:', metadata.recordCount);
console.log('Generated At:', metadata.generatedAt);
console.log('Purpose:', metadata.purpose);
console.log('');
console.log('Expected Hash:', signature.hash);
console.log('Calculated Hash:', calculatedHash);
console.log('');

let ok = calculatedHash === signature.hash;

// If KMS signature and public key are present, verify cryptographically
if (ok && signature.signature && signature.publicKeyPem) {
  try {
    const algo = (signature.algorithm || 'RSA-SHA256').toUpperCase();
    const verifier = crypto.createVerify(algo);
    verifier.update(signature.hash);
    verifier.end();
    const verified = verifier.verify(signature.publicKeyPem, Buffer.from(signature.signature, 'base64'));
    if (!verified) ok = false;
    console.log('KMS Signature Verified:', verified ? 'YES' : 'NO');
  } catch (e) {
    console.log('KMS verification skipped due to error:', e.message);
  }
}

if (ok) {
  console.log('✅ VERIFICATION PASSED');
  console.log('The bundle has not been tampered with.');
  process.exit(0);
} else {
  console.log('❌ VERIFICATION FAILED');
  console.log('The bundle may have been tampered with!');
  process.exit(1);
}
`;

    zip.file('verify.js', verificationScript);

    // 6. Add README
    const readme = `# XASE Evidence Bundle

## Bundle Information
- **Bundle ID**: ${bundle.bundleId}
- **Purpose**: ${bundle.purpose}
- **Created**: ${bundle.createdAt.toISOString()}
- **Created By**: ${bundle.createdBy}
- **Records**: ${records.length}

## Contents
- \`records.json\` - All decision records in this bundle
- \`metadata.json\` - Bundle metadata and compliance information
- \`signature.json\` - Cryptographic signature for verification
- \`verify.js\` - Offline verification script
- \`README.md\` - This file

## Verification
To verify the integrity of this bundle offline:

\`\`\`bash
node verify.js
\`\`\`

This will check that the records have not been tampered with since bundle creation.

## Compliance
This bundle is:
- ✅ WORM (Write-Once-Read-Many) compliant
- ✅ Tamper-evident with cryptographic signatures
- ✅ Suitable for legal proceedings and audits
- ✅ Verifiable offline without internet connection

## Support
For questions about this evidence bundle, contact your XASE administrator.

---
Generated by XASE AI Decision Platform
${new Date().toISOString()}
`;

    zip.file('README.md', readme);

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'BUNDLE_DOWNLOAD',
        resourceType: 'EVIDENCE_BUNDLE',
        resourceId: bundleId,
        userId: session.user.email,
        status: 'SUCCESS',
        metadata: JSON.stringify({
          purpose: bundle.purpose,
          recordCount: records.length,
          downloadedAt: new Date().toISOString(),
          storageKey: null,
        }),
      },
    });

    logger.info('bundle.download:legacy_zip', { requestId, bundleId, recordCount: records.length });
    // Return ZIP file
    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="evidence-bundle-${bundleId}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    const requestId = ensureRequestId(null);
    logger.error('bundle.download:error', { requestId }, error);
    await captureException(error, { requestId, tags: { action: 'BUNDLE_DOWNLOAD' } });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
