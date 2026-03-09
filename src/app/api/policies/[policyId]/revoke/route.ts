import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

// POST /api/policies/[policyId]/revoke - Revoke policy
export async function POST(
  req: NextRequest,
  { params }: { params: { policyId: string } }
) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
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

    const policy = await prisma.accessPolicy.findFirst({
      where: {
        id: params.policyId,
        clientTenantId: tenantId,
      },
    });

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    const updated = await prisma.accessPolicy.update({
      where: { id: params.policyId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    return NextResponse.json({
      ...updated,
      status: 'REVOKED',
    }, { status: 200 });
  } catch (error) {
    console.error('Error revoking policy:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
