/**
 * Lease Revoke API
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/leases/[leaseId]/revoke
 * Revoke a lease
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { leaseId: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let tenantId: string;
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || 'fallback-secret') as any;
      tenantId = decoded.tenantId;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { leaseId } = params;

    // Find the lease
    const lease = await prisma.accessLease.findFirst({
      where: {
        leaseId,
        clientTenantId: tenantId,
      },
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 });
    }

    // Update lease status to REVOKED
    const updatedLease = await prisma.accessLease.update({
      where: { id: lease.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    return NextResponse.json({
      lease: updatedLease,
      success: true,
    });
  } catch (error: any) {
    console.error('Error revoking lease:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to revoke lease' },
      { status: 500 }
    );
  }
}
