import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

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
    const body = await request.json().catch(() => ({}));
    const durationDays = body.durationDays || 7;

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

    // Calculate new expiration
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Update lease
    const updatedLease = await prisma.accessLease.update({
      where: { id: lease.id },
      data: {
        expiresAt: newExpiresAt,
        status: 'ACTIVE',
      },
    });

    // Log renewal
    await prisma.auditLog.create({
      data: {
        action: 'LEASE_RENEWED',
        resourceType: 'LEASE',
        resourceId: leaseId,
        userId: tenantId,
        errorMessage: null,
      },
    });

    return NextResponse.json({
      lease: {
        id: updatedLease.leaseId,
        leaseId: updatedLease.leaseId,
        datasetId: updatedLease.datasetId,
        policyId: updatedLease.policyId,
        status: updatedLease.status,
        issuedAt: updatedLease.issuedAt,
        expiresAt: updatedLease.expiresAt,
        clientTenantId: updatedLease.clientTenantId,
      },
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
