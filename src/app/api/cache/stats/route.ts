/**
 * Cache Statistics API
 * Monitor cache performance and usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getCacheStats } from '@/lib/cache/redis-cache';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/cache/stats
 * Get cache statistics
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
        xaseRole: true,
      },
    });

    // Only admins can view cache stats
    if (user?.xaseRole !== 'ADMIN' && user?.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const stats = await getCacheStats();

    const hitRate = stats.hits + stats.misses > 0
      ? (stats.hits / (stats.hits + stats.misses)) * 100
      : 0;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      stats: {
        ...stats,
        hitRate: Math.round(hitRate * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error('Error fetching cache stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
