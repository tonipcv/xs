/**
 * GDPR Article 17 - Right to Erasure (Real Implementation)
 * Complete implementation with cascading deletion
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { processRightToErasure } from '@/lib/compliance/gdpr-real';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason || !['consent_withdrawn', 'no_longer_necessary', 'objection', 'unlawful_processing'].includes(reason)) {
      return NextResponse.json(
        { error: 'Invalid reason. Must be one of: consent_withdrawn, no_longer_necessary, objection, unlawful_processing' },
        { status: 400 }
      );
    }

    const userId = session.user.email;

    const result = await processRightToErasure(userId, reason);

    return NextResponse.json({
      success: true,
      result,
      processedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Erasure error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process erasure request' },
      { status: 500 }
    );
  }
}
