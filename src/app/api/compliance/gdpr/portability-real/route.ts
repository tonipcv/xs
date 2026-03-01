/**
 * GDPR Article 20 - Right to Data Portability (Real Implementation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { processDataPortabilityRequest } from '@/lib/compliance/gdpr-real';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.email;

    const result = await processDataPortabilityRequest(userId);

    return NextResponse.json({
      success: true,
      result,
      processedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Portability error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process portability request' },
      { status: 500 }
    );
  }
}
