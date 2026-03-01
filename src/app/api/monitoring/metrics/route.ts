/**
 * Metrics API
 * Retrieve performance and business metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { 
  getPerformanceMetrics, 
  getTopEndpoints, 
  getErrorRates,
  getMetrics 
} from '@/lib/monitoring/metrics';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/monitoring/metrics
 * Get system metrics
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

    // Only admins can view metrics
    if (user?.xaseRole !== 'ADMIN' && user?.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const timeRange = parseInt(url.searchParams.get('timeRange') || '3600000'); // Default 1 hour
    const endpoint = url.searchParams.get('endpoint') || undefined;

    // Get performance metrics
    const performance = await getPerformanceMetrics(endpoint, timeRange);

    // Get top endpoints
    const topEndpoints = await getTopEndpoints(10, timeRange);

    // Get error rates
    const errorRates = await getErrorRates(timeRange);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      timeRange,
      performance,
      topEndpoints,
      errorRates: errorRates.slice(0, 10),
    });
  } catch (error: any) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
