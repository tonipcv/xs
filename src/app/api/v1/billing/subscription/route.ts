import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

// GET /api/v1/billing/subscription - Get subscription status
export async function GET(req: NextRequest) {
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

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    // Mock subscription for now - in production this would query Stripe
    const subscription = {
      id: 'sub_001',
      status: 'active',
      plan: 'pro',
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      features: ['unlimited_datasets', 'api_access', 'priority_support'],
    };

    return NextResponse.json({ subscription }, { status: 200 });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
