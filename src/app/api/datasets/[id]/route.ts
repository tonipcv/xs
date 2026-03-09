import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const updateDatasetSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'DELETED']).optional(),
});

// GET /api/datasets/:id - Get dataset by ID
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const { id } = params;

    const dataset = await prisma.dataset.findFirst({
      where: {
        OR: [
          { id },
          { datasetId: id },
        ],
        tenantId,
      },
    });

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    return NextResponse.json({ dataset }, { status: 200 });
  } catch (error) {
    console.error('Error fetching dataset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/datasets/:id - Update dataset
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const { id } = params;
    const body = await req.json();
    const validated = updateDatasetSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.errors },
        { status: 400 }
      );
    }

    // Find dataset
    const existing = await prisma.dataset.findFirst({
      where: {
        OR: [
          { id },
          { datasetId: id },
        ],
        tenantId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    const dataset = await prisma.dataset.update({
      where: { id: existing.id },
      data: validated.data,
    });

    return NextResponse.json({ dataset }, { status: 200 });
  } catch (error) {
    console.error('Error updating dataset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/datasets/:id - Delete dataset
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const { id } = params;

    // Find dataset
    const existing = await prisma.dataset.findFirst({
      where: {
        OR: [
          { id },
          { datasetId: id },
        ],
        tenantId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    await prisma.dataset.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
