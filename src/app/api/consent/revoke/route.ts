/**
 * Consent Revocation API
 * Allows users to revoke consent for data usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { publishConsentRevocation } from '@/lib/consent/propagation';
import { dispatchConsentRevoked } from '@/lib/webhooks/dispatcher';

const prisma = new PrismaClient();

/**
 * POST /api/consent/revoke
 * Revoke consent for a specific dataset
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        tenantId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { datasetId, reason } = body;

    if (!datasetId) {
      return NextResponse.json(
        { error: 'Dataset ID is required' },
        { status: 400 }
      );
    }

    // Verify dataset exists
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      select: {
        id: true,
        datasetId: true,
        name: true,
        tenantId: true,
      },
    });

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    const revocationId = `revoke_${Date.now()}`;
    const timestamp = new Date();

    // Update dataset consent status
    await prisma.dataset.update({
      where: { id: datasetId },
      data: {
        consentStatus: 'REVOKED',
      },
    });

    // Log the revocation
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'CONSENT_REVOKED',
        resourceType: 'dataset',
        resourceId: datasetId,
        metadata: JSON.stringify({
          revocationId,
          datasetId: dataset.datasetId,
          datasetName: dataset.name,
          reason: reason || 'User requested',
          timestamp: timestamp.toISOString(),
        }),
        status: 'SUCCESS',
        timestamp,
      },
    });

    // Publish to Redis Stream for propagation
    try {
      await publishConsentRevocation(
        user.id,
        datasetId,
        user.tenantId || 'unknown',
        reason
      );
    } catch (error) {
      console.error('Failed to publish consent revocation to Redis:', error);
      // Continue even if Redis fails - we've already updated the database
    }

    // Dispatch webhook event
    try {
      if (user.tenantId) {
        await dispatchConsentRevoked(
          user.tenantId,
          user.id,
          datasetId
        );
      }
    } catch (error) {
      console.error('Failed to dispatch webhook:', error);
    }

    // Get count of affected leases
    const affectedLeases = await prisma.accessLease.count({
      where: {
        datasetId,
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({
      success: true,
      revocationId,
      datasetId: dataset.datasetId,
      datasetName: dataset.name,
      timestamp: timestamp.toISOString(),
      affectedLeases,
      message: 'Consent revoked successfully. All active leases will be invalidated within 60 seconds.',
      propagationStatus: 'IN_PROGRESS',
    });
  } catch (error: any) {
    console.error('Error revoking consent:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/consent/revoke/:revocationId
 * Check status of a consent revocation
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const revocationId = url.pathname.split('/').pop();

    if (!revocationId) {
      return NextResponse.json(
        { error: 'Revocation ID required' },
        { status: 400 }
      );
    }

    // Look up revocation in audit logs
    const revocationLog = await prisma.auditLog.findFirst({
      where: {
        action: 'CONSENT_REVOKED',
        metadata: {
          contains: revocationId,
        },
      },
      select: {
        metadata: true,
        timestamp: true,
        status: true,
      },
    });

    if (!revocationLog) {
      return NextResponse.json(
        { error: 'Revocation not found' },
        { status: 404 }
      );
    }

    const metadata = JSON.parse(revocationLog.metadata || '{}');
    const datasetId = metadata.datasetId;

    // Check if there are still active leases
    const activeLeases = await prisma.accessLease.count({
      where: {
        datasetId,
        status: 'ACTIVE',
      },
    });

    const propagationComplete = activeLeases === 0;

    return NextResponse.json({
      revocationId,
      timestamp: revocationLog.timestamp,
      status: revocationLog.status,
      propagationComplete,
      remainingActiveLeases: activeLeases,
      metadata,
    });
  } catch (error: any) {
    console.error('Error checking revocation status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
