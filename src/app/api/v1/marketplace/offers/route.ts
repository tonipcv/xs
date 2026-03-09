import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/xase/auth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET /api/v1/marketplace/offers - List marketplace offers
export async function GET(req: NextRequest) {
  try {
    // Authenticate via API key
    const apiKey = req.headers.get('x-api-key') || '';
    const auth = await validateApiKey(apiKey);
    let tenantId: string | null = auth.valid ? (auth.tenantId || null) : null;

    if (!tenantId) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { tenantId: true },
      });
      tenantId = user?.tenantId || null;
      if (!tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Parse query parameters
    const url = new URL(req.url);
    const dataType = url.searchParams.get('dataType');
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // For now, return empty array or datasets that are ACTIVE
    const datasets = await prisma.dataset.findMany({
      where: {
        status: 'ACTIVE',
        ...(dataType && { dataType: dataType as any }),
      },
      take: Math.min(limit, 100),
      skip: offset,
      select: {
        datasetId: true,
        name: true,
        description: true,
        dataType: true,
        primaryLanguage: true,
        totalDurationHours: true,
        numRecordings: true,
        status: true,
        createdAt: true,
      },
    });

    // Map datasets to offers format
    const offers = datasets.map((dataset: any) => ({
      id: dataset.datasetId,
      name: dataset.name,
      description: dataset.description,
      dataType: dataset.dataType,
      language: dataset.primaryLanguage,
      duration: dataset.totalDurationHours,
      recordings: dataset.numRecordings,
      status: dataset.status,
      createdAt: dataset.createdAt,
    }));

    return NextResponse.json(offers);
  } catch (error) {
    console.error('Error listing marketplace offers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
