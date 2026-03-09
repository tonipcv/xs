import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

export async function GET(
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

    const lease = await prisma.accessLease.findFirst({
      where: {
        leaseId,
        clientTenantId: tenantId,
      },
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 });
    }

    return NextResponse.json({
      lease: {
        id: lease.leaseId,
        leaseId: lease.leaseId,
        datasetId: lease.datasetId,
        policyId: lease.policyId,
        status: lease.status,
        issuedAt: lease.issuedAt,
        expiresAt: lease.expiresAt,
        clientTenantId: lease.clientTenantId,
      },
    });
  } catch (error) {
    console.error('Error fetching lease:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
