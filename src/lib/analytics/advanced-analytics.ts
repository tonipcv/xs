/**
 * Advanced Analytics System
 * Real-time analytics with aggregation, segmentation, and insights
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface AnalyticsEvent {
  eventType: string;
  userId?: string;
  tenantId?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

export interface AnalyticsQuery {
  startDate: Date;
  endDate: Date;
  eventTypes?: string[];
  tenantId?: string;
  userId?: string;
  groupBy?: 'hour' | 'day' | 'week' | 'month';
}

export interface AnalyticsResult {
  total: number;
  byType: Record<string, number>;
  byDate: Array<{ date: string; count: number }>;
  topUsers?: Array<{ userId: string; count: number }>;
  topTenants?: Array<{ tenantId: string; count: number }>;
}

/**
 * Track analytics event
 */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  const timestamp = event.timestamp || new Date();
  
  // Store in Redis for real-time analytics
  const key = `analytics:${event.eventType}:${timestamp.toISOString().split('T')[0]}`;
  await redis.incr(key);
  await redis.expire(key, 86400 * 90); // 90 days retention

  // Store detailed event in database
  await prisma.auditLog.create({
    data: {
      action: event.eventType,
      resourceType: 'analytics',
      resourceId: 'event',
      userId: event.userId,
      tenantId: event.tenantId,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      status: 'SUCCESS',
      timestamp,
    },
  }).catch(() => {}); // Silent fail for analytics

  // Update real-time counters
  if (event.tenantId) {
    await redis.hincrby(`analytics:tenant:${event.tenantId}`, event.eventType, 1);
  }
  if (event.userId) {
    await redis.hincrby(`analytics:user:${event.userId}`, event.eventType, 1);
  }
}

/**
 * Query analytics data
 */
export async function queryAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult> {
  const cacheKey = `analytics:query:${JSON.stringify(query)}`;
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Build where clause
  const where: any = {
    timestamp: {
      gte: query.startDate,
      lte: query.endDate,
    },
    resourceType: 'analytics',
  };

  if (query.eventTypes && query.eventTypes.length > 0) {
    where.action = { in: query.eventTypes };
  }
  if (query.tenantId) {
    where.tenantId = query.tenantId;
  }
  if (query.userId) {
    where.userId = query.userId;
  }

  // Get total count
  const total = await prisma.auditLog.count({ where });

  // Get by type
  const byTypeData = await prisma.auditLog.groupBy({
    by: ['action'],
    where,
    _count: true,
  });

  const byType: Record<string, number> = {};
  byTypeData.forEach(item => {
    byType[item.action] = item._count;
  });

  // Get by date (simplified - would use SQL for better performance)
  const events = await prisma.auditLog.findMany({
    where,
    select: {
      timestamp: true,
      action: true,
    },
  });

  const byDateMap = new Map<string, number>();
  events.forEach(event => {
    const dateKey = formatDateByGrouping(event.timestamp, query.groupBy || 'day');
    byDateMap.set(dateKey, (byDateMap.get(dateKey) || 0) + 1);
  });

  const byDate = Array.from(byDateMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Get top users
  const topUsersData = await prisma.auditLog.groupBy({
    by: ['userId'],
    where: { ...where, userId: { not: null } },
    _count: true,
    orderBy: {
      _count: {
        userId: 'desc',
      },
    },
    take: 10,
  });

  const topUsers = topUsersData
    .filter(item => item.userId)
    .map(item => ({
      userId: item.userId!,
      count: item._count,
    }));

  // Get top tenants
  const topTenantsData = await prisma.auditLog.groupBy({
    by: ['tenantId'],
    where: { ...where, tenantId: { not: null } },
    _count: true,
    orderBy: {
      _count: {
        tenantId: 'desc',
      },
    },
    take: 10,
  });

  const topTenants = topTenantsData
    .filter(item => item.tenantId)
    .map(item => ({
      tenantId: item.tenantId!,
      count: item._count,
    }));

  const result: AnalyticsResult = {
    total,
    byType,
    byDate,
    topUsers,
    topTenants,
  };

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(result));

  return result;
}

/**
 * Get real-time analytics from Redis
 */
export async function getRealtimeAnalytics(
  tenantId?: string,
  userId?: string
): Promise<Record<string, number>> {
  if (tenantId) {
    const data = await redis.hgetall(`analytics:tenant:${tenantId}`);
    return Object.entries(data).reduce((acc, [key, value]) => {
      acc[key] = parseInt(value, 10);
      return acc;
    }, {} as Record<string, number>);
  }

  if (userId) {
    const data = await redis.hgetall(`analytics:user:${userId}`);
    return Object.entries(data).reduce((acc, [key, value]) => {
      acc[key] = parseInt(value, 10);
      return acc;
    }, {} as Record<string, number>);
  }

  return {};
}

/**
 * Get funnel analytics
 */
export async function getFunnelAnalytics(
  steps: string[],
  startDate: Date,
  endDate: Date,
  tenantId?: string
): Promise<Array<{ step: string; count: number; dropoff: number }>> {
  const results = [];
  let previousCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const count = await prisma.auditLog.count({
      where: {
        action: step,
        timestamp: { gte: startDate, lte: endDate },
        tenantId,
      },
    });

    const dropoff = i > 0 ? ((previousCount - count) / previousCount) * 100 : 0;

    results.push({
      step,
      count,
      dropoff: Math.round(dropoff * 100) / 100,
    });

    previousCount = count;
  }

  return results;
}

/**
 * Get cohort analysis
 */
export async function getCohortAnalysis(
  cohortDate: Date,
  retentionDays: number[],
  tenantId?: string
): Promise<Array<{ day: number; retained: number; percentage: number }>> {
  const cohortStart = new Date(cohortDate);
  cohortStart.setHours(0, 0, 0, 0);
  const cohortEnd = new Date(cohortStart);
  cohortEnd.setDate(cohortEnd.getDate() + 1);

  // Get users who signed up in cohort period
  const cohortUsers = await prisma.auditLog.findMany({
    where: {
      action: 'USER_CREATED',
      timestamp: { gte: cohortStart, lt: cohortEnd },
      tenantId,
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  const cohortUserIds = cohortUsers.map(u => u.userId).filter(Boolean) as string[];
  const cohortSize = cohortUserIds.length;

  const results = [];

  for (const day of retentionDays) {
    const retentionStart = new Date(cohortStart);
    retentionStart.setDate(retentionStart.getDate() + day);
    const retentionEnd = new Date(retentionStart);
    retentionEnd.setDate(retentionEnd.getDate() + 1);

    const retained = await prisma.auditLog.count({
      where: {
        userId: { in: cohortUserIds },
        timestamp: { gte: retentionStart, lt: retentionEnd },
        tenantId,
      },
    });

    results.push({
      day,
      retained,
      percentage: cohortSize > 0 ? Math.round((retained / cohortSize) * 10000) / 100 : 0,
    });
  }

  return results;
}

/**
 * Get user journey
 */
export async function getUserJourney(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ action: string; timestamp: Date; metadata?: any }>> {
  const events = await prisma.auditLog.findMany({
    where: {
      userId,
      timestamp: { gte: startDate, lte: endDate },
    },
    select: {
      action: true,
      timestamp: true,
      metadata: true,
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  return events.map(e => ({
    action: e.action,
    timestamp: e.timestamp,
    metadata: e.metadata ? (typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata) : undefined,
  }));
}

/**
 * Get conversion rate
 */
export async function getConversionRate(
  fromEvent: string,
  toEvent: string,
  startDate: Date,
  endDate: Date,
  tenantId?: string
): Promise<{ total: number; converted: number; rate: number }> {
  const where = {
    timestamp: { gte: startDate, lte: endDate },
    tenantId,
  };

  const total = await prisma.auditLog.count({
    where: { ...where, action: fromEvent },
  });

  // Get users who did fromEvent
  const fromUsers = await prisma.auditLog.findMany({
    where: { ...where, action: fromEvent },
    select: { userId: true },
    distinct: ['userId'],
  });

  const fromUserIds = fromUsers.map(u => u.userId).filter(Boolean) as string[];

  // Count how many also did toEvent
  const converted = await prisma.auditLog.count({
    where: {
      ...where,
      action: toEvent,
      userId: { in: fromUserIds },
    },
  });

  const rate = total > 0 ? Math.round((converted / total) * 10000) / 100 : 0;

  return { total, converted, rate };
}

/**
 * Format date by grouping
 */
function formatDateByGrouping(date: Date, groupBy: 'hour' | 'day' | 'week' | 'month'): string {
  const d = new Date(date);
  
  switch (groupBy) {
    case 'hour':
      return d.toISOString().substring(0, 13) + ':00:00';
    case 'day':
      return d.toISOString().split('T')[0];
    case 'week':
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      return weekStart.toISOString().split('T')[0];
    case 'month':
      return d.toISOString().substring(0, 7);
    default:
      return d.toISOString().split('T')[0];
  }
}

/**
 * Clear analytics cache
 */
export async function clearAnalyticsCache(): Promise<void> {
  const keys = await redis.keys('analytics:query:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
