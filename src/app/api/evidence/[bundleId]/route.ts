/**
 * Evidence Bundle API
 * F2-013: Evidence Bundle URL Real
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getEvidenceBundle, verifyKMSSignature } from '@/lib/evidence/evidence-bundle';

/**
 * GET /api/evidence/[bundleId]
 * Retrieve evidence bundle with presigned URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { bundleId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bundleId } = params;

    const bundle = await getEvidenceBundle(bundleId);

    if (!bundle) {
      return NextResponse.json({ error: 'Evidence bundle not found' }, { status: 404 });
    }

    return NextResponse.json(bundle);
  } catch (error: any) {
    console.error('Error retrieving evidence bundle:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve evidence bundle' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/evidence/[bundleId]/verify
 * Verify evidence bundle signature
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { bundleId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bundleId } = params;
    const bundle = await getEvidenceBundle(bundleId);

    if (!bundle) {
      return NextResponse.json({ error: 'Evidence bundle not found' }, { status: 404 });
    }

    const isValid = await verifyKMSSignature(bundle.fileHash, bundle.kmsSignature);

    return NextResponse.json({
      bundleId,
      valid: isValid,
      fileHash: bundle.fileHash,
      signature: bundle.kmsSignature,
      verifiedAt: new Date(),
    });
  } catch (error: any) {
    console.error('Error verifying evidence bundle:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify evidence bundle' },
      { status: 500 }
    );
  }
}
