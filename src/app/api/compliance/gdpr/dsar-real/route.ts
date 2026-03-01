/**
 * GDPR Article 15 - Data Subject Access Request (Real Implementation)
 * Complete DSAR with all personal data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { processDataSubjectAccessRequest } from '@/lib/compliance/gdpr-real';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.email;

    const dsarData = await processDataSubjectAccessRequest(userId);

    return NextResponse.json({
      success: true,
      data: dsarData,
      requestDate: new Date().toISOString(),
      responseDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('DSAR error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process DSAR' },
      { status: 500 }
    );
  }
}
