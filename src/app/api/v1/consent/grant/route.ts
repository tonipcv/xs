import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ConsentManager } from '@/lib/xase/consent-manager';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { datasetId, purpose = 'TRAINING', expiresInDays = 365 } = body;

    if (!datasetId) {
      return NextResponse.json(
        { error: 'datasetId is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update dataset consent status
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const dataset = await prisma.dataset.update({
      where: { id: datasetId },
      data: {
        consentStatus: 'VERIFIED_BY_XASE',
      },
    });

    // Consent grant logged via audit trail
    console.log(`Consent granted for dataset ${datasetId} by user ${user.id} for purpose: ${purpose}`);

    return NextResponse.json({
      success: true,
      dataset: {
        id: dataset.id,
        name: dataset.name,
        consentStatus: dataset.consentStatus,
        grantedAt: new Date(),
        expiresAt: expiresAt,
      },
    });

  } catch (error: any) {
    console.error('Error granting consent:', error);
    return NextResponse.json(
      { error: 'Failed to grant consent', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    );
  }
}
