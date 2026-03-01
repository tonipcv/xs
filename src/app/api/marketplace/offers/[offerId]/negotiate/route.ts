/**
 * API Route: Negotiate Marketplace Offer
 * POST /api/marketplace/offers/:offerId/negotiate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { initiateNegotiation } from '@/lib/marketplace/negotiation';

export async function POST(
  request: NextRequest,
  { params }: { params: { offerId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { proposedPrice, proposedTerms, message } = body;

    if (!proposedPrice || proposedPrice <= 0) {
      return NextResponse.json(
        { error: 'Invalid proposed price' },
        { status: 400 }
      );
    }

    const result = await initiateNegotiation({
      offerId: params.offerId,
      proposerId: session.user.id,
      proposedPrice,
      proposedTerms,
      message,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Negotiation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate negotiation' },
      { status: 500 }
    );
  }
}
