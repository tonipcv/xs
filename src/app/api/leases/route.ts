import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const createLeaseSchema = z.object({
  datasetId: z.string().min(1),
  policyId: z.string().min(1),
  purpose: z.enum(['RESEARCH', 'TRAINING', 'TESTING', 'PRODUCTION']).optional(),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
  ttlSeconds: z.coerce.number().int().min(60).max(3600).optional(),
});

function genLeaseId() {
  return 'lease_' + crypto.randomBytes(12).toString('hex');
}

// GET /api/leases - List leases
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
    const status = url.searchParams.get('status') as 'ACTIVE' | 'EXPIRED' | 'REVOKED' | null;

    const leases = await prisma.accessLease.findMany({
      where: {
        clientTenantId: tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });

    const total = await prisma.accessLease.count({
      where: {
        clientTenantId: tenantId,
        ...(status ? { status } : {}),
      },
    });

    return NextResponse.json({ leases, total }, { status: 200 });
  } catch (error) {
    console.error('Error fetching leases:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/leases - Create lease
export async function POST(req: NextRequest) {
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
    const validated = createLeaseSchema.safeParse(body);

    if (!validated.success) {
      console.log('Lease validation failed:', JSON.stringify(validated.error.errors));
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.errors },
        { status: 400 }
      );
    }

    const { datasetId, policyId, purpose, durationDays, ttlSeconds = 3600 } = validated.data;

    // Check if dataset exists
    const dataset = await prisma.dataset.findFirst({
      where: {
        id: datasetId,
        tenantId,
      },
    });

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    // Validate purpose if provided
    if (purpose && !['RESEARCH', 'TRAINING', 'TESTING', 'PRODUCTION'].includes(purpose)) {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
    }

    // Check policy duration limits if policyId and durationDays provided
    if (policyId && durationDays) {
      const policy = await prisma.accessPolicy.findFirst({
        where: {
          id: policyId,
          clientTenantId: tenantId,
        },
      });
      
      if (policy && policy.maxHours && durationDays > policy.maxHours / 24) {
        return NextResponse.json({ error: 'Duration exceeds policy limit' }, { status: 400 });
      }
    }

    // Create lease
    const leaseId = genLeaseId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const lease = await prisma.accessLease.create({
      data: {
        leaseId,
        datasetId,
        policyId: policyId || 'default',
        clientTenantId: tenantId,
        status: 'ACTIVE',
        issuedAt: now,
        expiresAt,
      },
    });

    return NextResponse.json({
      lease: {
        id: lease.leaseId,
        leaseId: lease.leaseId,
        datasetId,
        policyId: policyId || 'default',
        status: lease.status,
        issuedAt: lease.issuedAt,
        expiresAt: lease.expiresAt,
        clientTenantId: tenantId,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating lease:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
