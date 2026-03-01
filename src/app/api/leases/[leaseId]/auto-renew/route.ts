/**
 * Lease Auto-Renew API
 * F2-011: Auto-renew de Lease via UI
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * PUT /api/leases/[leaseId]/auto-renew
 * Update auto-renew settings for a lease
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { leaseId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = params;
    const body = await request.json();
    const { enabled, maxRenewals, budgetLimit } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required field: enabled' },
        { status: 400 }
      );
    }

    // Update auto-renew configuration
    const autoRenewConfig = {
      enabled,
      maxRenewals: maxRenewals || 10,
      budgetLimit: budgetLimit || 1000,
      currentRenewals: 0,
      updatedAt: new Date(),
    };

    // Store in database (assuming we have an autoRenewConfig field or separate table)
    // For now, we'll use metadata field
    await prisma.auditLog.create({
      data: {
        action: 'LEASE_AUTO_RENEW_UPDATED',
        resourceType: 'lease',
        resourceId: leaseId,
        userId: session.user.email,
        metadata: JSON.stringify(autoRenewConfig),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Auto-renew settings updated successfully',
      config: autoRenewConfig,
    });
  } catch (error: any) {
    console.error('Error updating auto-renew settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update auto-renew settings' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leases/[leaseId]/auto-renew
 * Get auto-renew settings for a lease
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { leaseId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = params;

    // Fetch latest auto-renew configuration from audit logs
    const latestConfig = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'lease',
        resourceId: leaseId,
        action: 'LEASE_AUTO_RENEW_UPDATED',
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (!latestConfig) {
      return NextResponse.json({
        enabled: false,
        maxRenewals: 10,
        budgetLimit: 1000,
        currentRenewals: 0,
      });
    }

    const config = JSON.parse(latestConfig.metadata as string);

    return NextResponse.json(config);
  } catch (error: any) {
    console.error('Error fetching auto-renew settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch auto-renew settings' },
      { status: 500 }
    );
  }
}
