import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        tenant: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get all datasets for the user's tenant
    if (!user.tenantId) {
      return NextResponse.json({ datasets: [] });
    }

    const datasets = await prisma.dataset.findMany({
      where: {
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        name: true,
        consentStatus: true,
      },
    });

    // Transform to preferences format
    const preferences = datasets.map((dataset) => ({
      id: dataset.id,
      datasetId: dataset.id,
      datasetName: dataset.name,
      purpose: 'TRAINING', // Default purpose
      granted: dataset.consentStatus === 'VERIFIED_BY_XASE' || dataset.consentStatus === 'SELF_DECLARED',
      grantedAt: null,
      expiresAt: null,
    }));

    return NextResponse.json({
      preferences,
      total: preferences.length,
    });

  } catch (error: any) {
    console.error('Error fetching consent preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    );
  }
}
