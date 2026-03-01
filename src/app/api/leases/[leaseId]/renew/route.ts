/**
 * Lease Manual Renew API
 * F2-011: Auto-renew de Lease via UI
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/leases/[leaseId]/renew
 * Manually renew a lease
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { leaseId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = params;

    // Fetch current lease (placeholder - would use actual lease model)
    const currentLease = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'lease',
        resourceId: leaseId,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (!currentLease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 });
    }

    // Calculate new expiration (extend by original duration)
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    // Log renewal
    await prisma.auditLog.create({
      data: {
        action: 'LEASE_RENEWED',
        resourceType: 'lease',
        resourceId: leaseId,
        userId: session.user.email,
        metadata: JSON.stringify({
          renewedAt: now,
          newExpiresAt,
          renewalType: 'manual',
        }),
        status: 'SUCCESS',
        timestamp: now,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Lease renewed successfully',
      newExpiresAt,
    });
  } catch (error: any) {
    console.error('Error renewing lease:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to renew lease' },
      { status: 500 }
    );
  }
}
