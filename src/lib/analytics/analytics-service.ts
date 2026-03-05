/**
 * Analytics and Reporting Service
 * Business intelligence and data analytics
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AnalyticsReport {
  period: string;
  startDate: Date;
  endDate: Date;
  metrics: {
    datasets: DatasetMetrics;
    leases: LeaseMetrics;
    revenue: RevenueMetrics;
    users: UserMetrics;
    performance: PerformanceMetrics;
  };
}

export interface DatasetMetrics {
  total: number;
  created: number;
  published: number;
  totalSize: number;
  byType: Record<string, number>;
  topDatasets: Array<{ id: string; name: string; accessCount: number }>;
}

export interface LeaseMetrics {
  total: number;
  active: number;
  expired: number;
  revoked: number;
  averageDuration: number;
  byStatus: Record<string, number>;
}

export interface RevenueMetrics {
  total: number;
  byTier: Record<string, number>;
  growth: number;
  arpu: number;
}

export interface UserMetrics {
  total: number;
  active: number;
  new: number;
  churnRate: number;
  byRole: Record<string, number>;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  errorRate: number;
  uptime: number;
  requestCount: number;
}

/**
 * Generate analytics report for a period
 */
export async function generateAnalyticsReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<AnalyticsReport> {
  const period = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;

  // Dataset metrics
  const datasets = await prisma.dataset.findMany({
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const allDatasets = await prisma.dataset.findMany({
    where: { tenantId },
  });

  const datasetsByType = datasets.reduce((acc, d) => {
    const key = (d.dataType as string | null) || 'UNKNOWN'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalSize = datasets.reduce((sum, d) => sum + (d.totalDurationHours || 0), 0);

  // Lease metrics
  const leases = await prisma.accessLease.findMany({
    where: {
      issuedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const leasesByStatus = leases.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeLeasesCount = leases.filter(l => l.status === 'ACTIVE').length;
  const expiredLeasesCount = leases.filter(l => l.status === 'EXPIRED').length;
  const revokedLeasesCount = leases.filter(l => l.status === 'REVOKED').length;

  const averageDuration = leases.length > 0
    ? leases.reduce((sum, l) => {
        if (l.expiresAt && l.issuedAt) {
          return sum + (l.expiresAt.getTime() - l.issuedAt.getTime());
        }
        return sum;
      }, 0) / leases.length / (1000 * 60 * 60 * 24) // Convert to days
    : 0;

  // Revenue metrics
  const billingSnapshots = await prisma.billingSnapshot.findMany({
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const totalRevenue = billingSnapshots.reduce((sum, b) => sum + (b.audioMinutes * 0.05), 0);

  // User metrics
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const allUsers = await prisma.user.findMany({
    where: { tenantId },
  });

  const usersByRole = allUsers.reduce((acc, u) => {
    acc[u.xaseRole || 'VIEWER'] = (acc[u.xaseRole || 'VIEWER'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Performance metrics (placeholder - would come from monitoring system)
  const performanceMetrics: PerformanceMetrics = {
    averageResponseTime: 150,
    errorRate: 0.5,
    uptime: 99.9,
    requestCount: 10000,
  };

  return {
    period,
    startDate,
    endDate,
    metrics: {
      datasets: {
        total: allDatasets.length,
        created: datasets.length,
        published: datasets.filter(d => d.status === 'ACTIVE').length,
        totalSize,
        byType: datasetsByType,
        topDatasets: [],
      },
      leases: {
        total: leases.length,
        active: activeLeasesCount,
        expired: expiredLeasesCount,
        revoked: revokedLeasesCount,
        averageDuration: Math.round(averageDuration),
        byStatus: leasesByStatus,
      },
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        byTier: {},
        growth: 0,
        arpu: allUsers.length > 0 ? Math.round((totalRevenue / allUsers.length) * 100) / 100 : 0,
      },
      users: {
        total: allUsers.length,
        active: allUsers.length,
        new: users.length,
        churnRate: 0,
        byRole: usersByRole,
      },
      performance: performanceMetrics,
    },
  };
}

/**
 * Get dataset usage statistics
 */
export async function getDatasetUsageStats(
  datasetId: string,
  days: number = 30
): Promise<{
  accessCount: number;
  uniqueUsers: number;
  totalDuration: number;
  byDay: Array<{ date: string; count: number }>;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const leases = await prisma.accessLease.findMany({
    where: {
      datasetId,
      issuedAt: {
        gte: startDate,
      },
    },
  });

  const uniqueUsers = new Set(leases.map(l => l.clientTenantId)).size;

  const byDay = leases.reduce((acc, lease) => {
    const date = lease.issuedAt.toISOString().split('T')[0];
    const existing = acc.find(d => d.date === date);
    if (existing) {
      existing.count++;
    } else {
      acc.push({ date, count: 1 });
    }
    return acc;
  }, [] as Array<{ date: string; count: number }>);

  return {
    accessCount: leases.length,
    uniqueUsers,
    totalDuration: 0,
    byDay: byDay.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Get tenant growth metrics
 */
export async function getTenantGrowthMetrics(
  tenantId: string,
  months: number = 12
): Promise<Array<{
  month: string;
  datasets: number;
  leases: number;
  revenue: number;
}>> {
  const results: Array<{
    month: string;
    datasets: number;
    leases: number;
    revenue: number;
  }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const month = date.toISOString().substring(0, 7);

    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const datasets = await prisma.dataset.count({
      where: {
        tenantId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const leases = await prisma.accessLease.count({
      where: {
        issuedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const billing = await prisma.billingSnapshot.findFirst({
      where: {
        tenantId,
        period: month,
      },
    });

    const revenue = billing ? billing.audioMinutes * 0.05 : 0;

    results.push({
      month,
      datasets,
      leases,
      revenue: Math.round(revenue * 100) / 100,
    });
  }

  return results;
}

/**
 * Get compliance metrics
 */
export async function getComplianceMetrics(
  tenantId: string
): Promise<{
  dsarRequests: number;
  erasureRequests: number;
  breachReports: number;
  consentRevocations: number;
  averageResponseTime: number;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      tenantId,
      timestamp: {
        gte: startDate,
      },
      action: {
        in: [
          'GDPR_DSAR_REQUESTED',
          'GDPR_ERASURE_REQUESTED',
          'GDPR_BREACH_REPORTED',
          'CONSENT_REVOKED',
        ],
      },
    },
  });

  const dsarRequests = auditLogs.filter(l => l.action === 'GDPR_DSAR_REQUESTED').length;
  const erasureRequests = auditLogs.filter(l => l.action === 'GDPR_ERASURE_REQUESTED').length;
  const breachReports = auditLogs.filter(l => l.action === 'GDPR_BREACH_REPORTED').length;
  const consentRevocations = auditLogs.filter(l => l.action === 'CONSENT_REVOKED').length;

  return {
    dsarRequests,
    erasureRequests,
    breachReports,
    consentRevocations,
    averageResponseTime: 24, // hours
  };
}

/**
 * Export analytics report to CSV
 */
export function exportAnalyticsToCSV(report: AnalyticsReport): string {
  const lines: string[] = [];

  lines.push('XASE Sheets Analytics Report');
  lines.push(`Period: ${report.period}`);
  lines.push(`Start Date: ${report.startDate.toISOString()}`);
  lines.push(`End Date: ${report.endDate.toISOString()}`);
  lines.push('');

  lines.push('Dataset Metrics');
  lines.push(`Total Datasets,${report.metrics.datasets.total}`);
  lines.push(`Created,${report.metrics.datasets.created}`);
  lines.push(`Published,${report.metrics.datasets.published}`);
  lines.push(`Total Size (hours),${report.metrics.datasets.totalSize}`);
  lines.push('');

  lines.push('Lease Metrics');
  lines.push(`Total Leases,${report.metrics.leases.total}`);
  lines.push(`Active,${report.metrics.leases.active}`);
  lines.push(`Expired,${report.metrics.leases.expired}`);
  lines.push(`Revoked,${report.metrics.leases.revoked}`);
  lines.push(`Average Duration (days),${report.metrics.leases.averageDuration}`);
  lines.push('');

  lines.push('Revenue Metrics');
  lines.push(`Total Revenue,$${report.metrics.revenue.total}`);
  lines.push(`ARPU,$${report.metrics.revenue.arpu}`);
  lines.push('');

  lines.push('User Metrics');
  lines.push(`Total Users,${report.metrics.users.total}`);
  lines.push(`New Users,${report.metrics.users.new}`);
  lines.push('');

  return lines.join('\n');
}
