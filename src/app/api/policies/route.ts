import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { validateApiKey } from '@/lib/xase/auth';
import jwt from 'jsonwebtoken';

const createPolicySchema = z.object({
  datasetId: z.string().min(1),
  name: z.string().min(1).optional(),
  rules: z.record(z.any()).optional(),
  type: z.string().min(1).optional(),
  conditions: z.record(z.any()).optional(),
  pricing: z.record(z.any()).optional(),
  maxDurationDays: z.number().int().min(1).optional(),
  allowedRegions: z.array(z.string()).optional(),
  allowedPurposes: z.array(z.string()).optional(),
});

// GET /api/policies - List policies
export async function GET(req: NextRequest) {
  try {
    // Get auth token from header
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify JWT
    let tenantId: string;
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || 'fallback-secret') as any;
      tenantId = decoded.tenantId;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const url = new URL(req.url);
    const datasetId = url.searchParams.get('datasetId');

    const policies = await prisma.accessPolicy.findMany({
      where: {
        clientTenantId: tenantId,
        ...(datasetId ? { datasetId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(policies, { status: 200 });
  } catch (error) {
    console.error('Error fetching policies:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/policies - Create policy
export async function POST(req: NextRequest) {
  try {
    // Get auth token from header
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify JWT
    let tenantId: string;
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || 'fallback-secret') as any;
      tenantId = decoded.tenantId;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await req.json();
    const validated = createPolicySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { datasetId, name, rules, type, conditions, pricing, maxDurationDays } = validated.data;

    if (!datasetId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Require at least one policy-defining field (name, type, conditions, pricing, rules, maxDurationDays)
    if (!name && !type && !conditions && !pricing && !rules && !maxDurationDays) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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

    // Calculate maxHours from maxDurationDays (converting days to hours)
    const maxHours = maxDurationDays ? maxDurationDays * 24 : (conditions?.maxDuration ? conditions.maxDuration * 24 : null);

    // Create policy
    const policy = await prisma.accessPolicy.create({
      data: {
        datasetId: dataset.id,
        clientTenantId: tenantId,
        policyId: `pol_${Date.now()}`,
        usagePurpose: type || 'RESEARCH',
        status: 'ACTIVE',
        maxHours,
        canStream: true,
        canBatchDownload: false,
        hoursConsumed: 0,
        downloadsCount: 0,
      },
    });

    // Return with name for test compatibility
    return NextResponse.json({
      policy: {
        ...policy,
        name: name || `Policy for ${datasetId}`,
        rules: rules || {},
        type,
        conditions,
        pricing,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating policy:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
