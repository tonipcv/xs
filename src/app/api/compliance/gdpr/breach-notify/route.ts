/**
 * GDPR Article 33 - Data Breach Notification (Real Implementation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { notifyDataBreach } from '@/lib/compliance/gdpr-real';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, affectedUsers, dataCategories, likelyConsequences, measuresTaken, discoveredAt } = body;

    if (!type || !affectedUsers || !dataCategories || !likelyConsequences || !measuresTaken || !discoveredAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await notifyDataBreach({
      type,
      affectedUsers,
      dataCategories,
      likelyConsequences,
      measuresTaken,
      discoveredAt: new Date(discoveredAt),
    });

    return NextResponse.json({
      success: true,
      result,
      processedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Breach notification error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process breach notification' },
      { status: 500 }
    );
  }
}
