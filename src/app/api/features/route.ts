/**
 * Feature Flags API
 * Manage feature flags for gradual rollouts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { 
  getAllFeatureFlags,
  setFeatureFlag,
  deleteFeatureFlag,
  getUserFeatureFlags,
  isFeatureEnabled 
} from '@/lib/features/feature-flags';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/features
 * Get all feature flags or user-specific flags
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        tenantId: true,
        xaseRole: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'user';

    if (mode === 'all') {
      // Only admins can view all flags
      if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      const flags = await getAllFeatureFlags();
      return NextResponse.json({ flags });
    }

    // Get user-specific flags
    const flags = await getUserFeatureFlags(
      user.tenantId || '',
      user.id,
      user.xaseRole || 'VIEWER'
    );

    return NextResponse.json({ flags });
  } catch (error: any) {
    console.error('Error fetching feature flags:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/features
 * Create or update a feature flag
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        xaseRole: true,
      },
    });

    // Only owners can manage feature flags
    if (user?.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only owners can manage feature flags.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, enabled, description, rolloutPercentage, enabledFor, metadata } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Feature name is required' },
        { status: 400 }
      );
    }

    await setFeatureFlag({
      name,
      enabled: enabled !== undefined ? enabled : true,
      description,
      rolloutPercentage,
      enabledFor,
      metadata,
    });

    return NextResponse.json({
      success: true,
      message: 'Feature flag updated',
    });
  } catch (error: any) {
    console.error('Error updating feature flag:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/features
 * Delete a feature flag
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        xaseRole: true,
      },
    });

    if (user?.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const name = url.searchParams.get('name');

    if (!name) {
      return NextResponse.json(
        { error: 'Feature name is required' },
        { status: 400 }
      );
    }

    await deleteFeatureFlag(name);

    return NextResponse.json({
      success: true,
      message: 'Feature flag deleted',
    });
  } catch (error: any) {
    console.error('Error deleting feature flag:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
