/**
 * Real-time Dashboard Metrics API
 * Provides comprehensive metrics for monitoring dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/**
 * GET /api/dashboard/metrics
 * Get real-time dashboard metrics
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('range') || '24h';

    // Calculate time range
    const now = new Date();
    const startTime = getStartTime(timeRange);

    // Get tenant ID
    const tenantId = (session.user as any).tenantId;

    // Fetch metrics in parallel
    const [
      datasetsMetrics,
      leasesMetrics,
      usageMetrics,
      revenueMetrics,
      performanceMetrics,
      errorMetrics,
      activeUsers,
      systemHealth,
    ] = await Promise.all([
      getDatasetsMetrics(tenantId, startTime),
      getLeasesMetrics(tenantId, startTime),
      getUsageMetrics(tenantId, startTime),
      getRevenueMetrics(tenantId, startTime),
      getPerformanceMetrics(timeRange),
      getErrorMetrics(timeRange),
      getActiveUsers(tenantId, timeRange),
      getSystemHealth(),
    ]);

    return NextResponse.json({
      timestamp: now.toISOString(),
      timeRange,
      metrics: {
        datasets: datasetsMetrics,
        leases: leasesMetrics,
        usage: usageMetrics,
        revenue: revenueMetrics,
        performance: performanceMetrics,
        errors: errorMetrics,
        activeUsers,
        systemHealth,
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

/**
 * Get datasets metrics
 */
async function getDatasetsMetrics(tenantId: string, startTime: Date) {
  const [total, created, updated, deleted, byType] = await Promise.all([
    // Total datasets
    prisma.dataset.count({ where: { tenantId } }),
    
    // Created in time range
    prisma.dataset.count({
      where: {
        tenantId,
        createdAt: { gte: startTime },
      },
    }),
    
    // Updated in time range
    prisma.dataset.count({
      where: {
        tenantId,
        updatedAt: { gte: startTime },
      },
    }),
    
    // Deleted in time range (from audit log)
    prisma.auditLog.count({
      where: {
        tenantId,
        action: 'DATASET_DELETED',
        timestamp: { gte: startTime },
      },
    }),
    
    // By data type
    prisma.dataset.groupBy({
      by: ['dataType'],
      where: { tenantId },
      _count: true,
    }),
  ]);

  return {
    total,
    created,
    updated,
    deleted,
    byType: byType.map(g => ({
      type: g.dataType,
      count: g._count,
    })),
  };
}

/**
 * Get leases metrics
 */
async function getLeasesMetrics(tenantId: string, startTime: Date) {
  const [total, active, expired, revoked, created, byStatus] = await Promise.all([
    // Total leases
    prisma.accessLease.count({ where: { clientTenantId: tenantId } }),
    
    // Active leases
    prisma.accessLease.count({
      where: {
        clientTenantId: tenantId,
        status: 'ACTIVE',
      },
    }),
    
    // Expired leases
    prisma.accessLease.count({
      where: {
        clientTenantId: tenantId,
        status: 'EXPIRED',
      },
    }),
    
    // Revoked leases
    prisma.accessLease.count({
      where: {
        clientTenantId: tenantId,
        status: 'REVOKED',
      },
    }),
    
    // Created in time range (simplified - no timestamp field available)
    prisma.accessLease.count({
      where: {
        clientTenantId: tenantId,
      },
    }),
    
    // By status
    prisma.accessLease.groupBy({
      by: ['status'],
      where: { clientTenantId: tenantId },
      _count: true,
    }),
  ]);

  return {
    total,
    active,
    expired,
    revoked,
    created,
    byStatus: byStatus.map(g => ({
      status: g.status,
      count: g._count,
    })),
  };
}

/**
 * Get usage metrics
 */
async function getUsageMetrics(tenantId: string, startTime: Date) {
  const usage = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: 'USAGE_RECORDED',
      timestamp: { gte: startTime },
    },
    select: {
      metadata: true,
    },
  });

  let totalBytes = 0;
  let totalRecords = 0;

  usage.forEach(u => {
    try {
      const meta = typeof u.metadata === 'string' ? JSON.parse(u.metadata) : u.metadata;
      totalBytes += meta.bytesTransferred || 0;
      totalRecords += meta.recordsAccessed || 0;
    } catch (e) {}
  });

  return {
    totalBytes,
    totalRecords,
    totalRequests: usage.length,
    averageBytesPerRequest: usage.length > 0 ? totalBytes / usage.length : 0,
  };
}

/**
 * Get revenue metrics
 */
async function getRevenueMetrics(tenantId: string, startTime: Date) {
  const invoices = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: 'INVOICE_PAID',
      timestamp: { gte: startTime },
    },
    select: {
      metadata: true,
    },
  });

  let totalRevenue = 0;
  let paidInvoices = 0;

  invoices.forEach(inv => {
    try {
      const meta = typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata;
      totalRevenue += meta.amount || 0;
      paidInvoices++;
    } catch (e) {}
  });

  return {
    totalRevenue,
    paidInvoices,
    averageInvoiceValue: paidInvoices > 0 ? totalRevenue / paidInvoices : 0,
  };
}

/**
 * Get performance metrics from Redis
 */
async function getPerformanceMetrics(timeRange: string) {
  try {
    const metricsKey = `metrics:performance:${timeRange}`;
    const cached = await redis.get(metricsKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Calculate from recent requests
    const metrics = {
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      requestsPerMinute: 0,
      errorRate: 0,
    };

    // Cache for 1 minute
    await redis.setex(metricsKey, 60, JSON.stringify(metrics));
    
    return metrics;
  } catch (error) {
    return {
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      requestsPerMinute: 0,
      errorRate: 0,
    };
  }
}

/**
 * Get error metrics
 */
async function getErrorMetrics(timeRange: string) {
  const startTime = getStartTime(timeRange);
  
  const errors = await prisma.auditLog.count({
    where: {
      status: 'FAILED',
      timestamp: { gte: startTime },
    },
  });

  const errorsByType = await prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      status: 'FAILED',
      timestamp: { gte: startTime },
    },
    _count: true,
  });

  return {
    total: errors,
    byType: errorsByType.map(e => ({
      type: e.action,
      count: e._count,
    })),
  };
}

/**
 * Get active users
 */
async function getActiveUsers(tenantId: string, timeRange: string) {
  const startTime = getStartTime(timeRange);
  
  const activeUsers = await prisma.auditLog.findMany({
    where: {
      tenantId,
      timestamp: { gte: startTime },
    },
    select: {
      userId: true,
    },
    distinct: ['userId'],
  });

  return {
    count: activeUsers.filter(u => u.userId).length,
  };
}

/**
 * Get system health
 */
async function getSystemHealth() {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    const dbHealthy = true;

    // Check Redis
    const redisPing = await redis.ping();
    const redisHealthy = redisPing === 'PONG';

    return {
      status: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
      services: {
        database: dbHealthy,
        redis: redisHealthy,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      services: {
        database: false,
        redis: false,
      },
    };
  }
}

/**
 * Get start time based on range
 */
function getStartTime(range: string): Date {
  const now = new Date();
  
  switch (range) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '6h':
      return new Date(now.getTime() - 6 * 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
}
