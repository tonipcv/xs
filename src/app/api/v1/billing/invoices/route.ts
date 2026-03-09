import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

// GET /api/v1/billing/invoices - List invoices
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

    const url = new URL(req.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    // Build query filters
    const where: any = { tenantId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Mock invoices for now - in production this would query Stripe or billing provider
    const invoices = [
      {
        id: 'inv_001',
        amount: 99.00,
        currency: 'USD',
        status: 'paid',
        createdAt: new Date().toISOString(),
        periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        periodEnd: new Date().toISOString(),
      },
      {
        id: 'inv_002', 
        amount: 149.00,
        currency: 'USD',
        status: 'open',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        periodStart: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        periodEnd: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    return NextResponse.json({ invoices }, { status: 200 });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
