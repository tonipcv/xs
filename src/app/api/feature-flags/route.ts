/**
 * Feature Flags API
 * Manage feature flags dynamically
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  listFeatureFlags,
  setFeatureFlag,
  deleteFeatureFlag,
  isFeatureEnabled,
  getFeatureFlagStats,
  FeatureFlagName,
} from '@/lib/feature-flags/feature-flags';

/**
 * GET /api/feature-flags
 * List all feature flags
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const featureName = searchParams.get('name') as FeatureFlagName | null;
    const userId = searchParams.get('userId');
    const tenantId = searchParams.get('tenantId');

    // Check specific feature
    if (featureName) {
      const enabled = await isFeatureEnabled(featureName, userId || undefined, tenantId || undefined);
      const stats = await getFeatureFlagStats(featureName);
      
      return NextResponse.json({
        name: featureName,
        enabled,
        stats,
      });
    }

    // List all features
    const flags = await listFeatureFlags();
    return NextResponse.json({ flags });
  } catch (error: any) {
    console.error('Error fetching feature flags:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch feature flags' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/feature-flags
 * Create or update feature flag
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, enabled, rolloutPercentage, targetUsers, targetTenants } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    const flag = await setFeatureFlag({
      id: id || name,
      name,
      description: description || '',
      enabled: enabled !== undefined ? enabled : true,
      rolloutPercentage: rolloutPercentage !== undefined ? rolloutPercentage : 100,
      targetUsers,
      targetTenants,
    });

    return NextResponse.json({ flag }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating feature flag:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create feature flag' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/feature-flags
 * Delete feature flag
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') as FeatureFlagName;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required parameter: name' },
        { status: 400 }
      );
    }

    await deleteFeatureFlag(name);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting feature flag:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete feature flag' },
      { status: 500 }
    );
  }
}
