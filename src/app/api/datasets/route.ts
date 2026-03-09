import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

const createDatasetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dataType: z.enum(['AUDIO', 'TEXT', 'IMAGE', 'VIDEO', 'TABULAR']).optional(),
});

// GET /api/datasets - List datasets
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
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const dataType = url.searchParams.get('dataType') as string | undefined;

    const where: any = { tenantId };
    if (dataType) {
      where.dataType = dataType as any;
    }

    const [datasets, total] = await Promise.all([
      prisma.dataset.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dataset.count({ where }),
    ]);

    return NextResponse.json({ datasets, total, page, limit }, { status: 200 });
  } catch (error) {
    console.error('Error fetching datasets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/datasets - Create dataset
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
    const validated = createDatasetSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.errors },
        { status: 400 }
      );
    }

    const { name, description, dataType } = validated.data;

    const dataset = await prisma.dataset.create({
      data: {
        name,
        description,
        dataType: dataType as any,
        tenantId,
        datasetId: `ds_${Date.now()}`,
        storageLocation: '/default',
        status: 'ACTIVE',
        primaryLanguage: 'en-US',
        language: 'en-US',
        totalSizeBytes: BigInt(0),
        numRecordings: 0,
        totalDurationHours: 0,
      },
    });

    // Convert BigInt to string for JSON serialization
    const serializedDataset = {
      ...dataset,
      totalSizeBytes: dataset.totalSizeBytes.toString(),
    };

    return NextResponse.json({ dataset: serializedDataset }, { status: 201 });
  } catch (error: any) {
    console.error('[Datasets] Error creating dataset:', error?.message || error, error?.stack);
    return NextResponse.json({ error: 'Internal server error', details: error?.message }, { status: 500 });
  }
}
