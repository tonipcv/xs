/**
 * Policy Dry-Run API
 * Test policies before publishing
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  performPolicyDryRun,
  comparePolicies,
  generatePolicyRecommendations,
} from '@/lib/policies/dry-run';

export async function POST(
  request: NextRequest,
  { params }: { params: { policyId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { policyId } = params;
    const body = await request.json();
    const { compareWith } = body;

    if (compareWith) {
      // Compare two policies
      const comparison = await comparePolicies(policyId, compareWith);
      return NextResponse.json({ comparison });
    } else {
      // Perform dry-run
      const result = await performPolicyDryRun(policyId);
      const recommendations = await generatePolicyRecommendations(policyId);

      return NextResponse.json({
        result,
        recommendations,
      });
    }
  } catch (error: any) {
    console.error('Policy dry-run error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to perform dry-run' },
      { status: 500 }
    );
  }
}
