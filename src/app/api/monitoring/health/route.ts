/**
 * System Health Monitoring API
 * Health check and system status endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSystemHealth, getPerformanceMetrics } from '@/lib/monitoring/metrics';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/monitoring/health
 * Get system health status
 */
export async function GET(request: NextRequest) {
  try {
    const health = await getSystemHealth();

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      health.checks.database = true;
    } catch {
      health.checks.database = false;
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;

    return NextResponse.json({
      status: health.status,
      timestamp: new Date().toISOString(),
      checks: health.checks,
      metrics: health.metrics,
    }, { status: statusCode });
  } catch (error: any) {
    console.error('Error checking system health:', error);
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    }, { status: 503 });
  }
}
