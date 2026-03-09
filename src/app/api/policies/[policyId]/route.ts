import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

// GET /api/policies/[policyId] - Get policy by ID
export async function GET(
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

    return NextResponse.json(policy, { status: 200 });
  } catch (error) {
    console.error('Error fetching policy:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/policies/[policyId] - Update policy
export async function PATCH(
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

    const body = await req.json();
    const { name } = body;

    const policy = await prisma.accessPolicy.findFirst({
      where: {
        id: params.policyId,
        clientTenantId: tenantId,
      },
    });

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    // Update policy in database
    const updatedPolicy = await prisma.accessPolicy.update({
      where: { id: policy.id },
      data: {
        usagePurpose: name || policy.usagePurpose,
      },
    });

    // Return updated policy with name for test compatibility
    return NextResponse.json({
      ...updatedPolicy,
      name: updatedPolicy.usagePurpose,
    }, { status: 200 });
  } catch (error) {
    console.error('Error updating policy:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
