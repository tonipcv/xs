/**
 * Detailed Health Check API
 * Comprehensive system health monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { performHealthCheck, getSystemMetrics } from '@/lib/health/health-checks';

/**
 * GET /api/health/detailed
 * Get comprehensive health check
 */
export async function GET(request: NextRequest) {
  try {
    const health = await performHealthCheck();
    const metrics = await getSystemMetrics();

    const response = {
      ...health,
      metrics,
    };

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

    return NextResponse.json(response, { status: statusCode });
  } catch (error: any) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      },
      { status: 503 }
    );
  }
}
