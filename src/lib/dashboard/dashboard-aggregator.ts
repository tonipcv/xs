/**
 * DASHBOARD AGGREGATOR
 * Aggregate metrics for dashboard views
 */

import { prisma } from '@/lib/prisma'
import { UsageAnalytics } from '@/lib/analytics/usage-analytics'
import { HealthChecker } from '@/lib/monitoring/health-checker'
import { AlertManager } from '@/lib/notifications/alert-manager'
import { AuditViewer } from '@/lib/audit/audit-viewer'

export interface DashboardMetrics {
  overview: {
    totalDatasets: number
    totalPolicies: number
    totalLeases: number
    activeUsers: number
    storageUsedGB: number
  }
  usage: {
    apiCallsToday: number
    apiCallsThisWeek: number
    apiCallsThisMonth: number
    dataProcessedGB: number
    errorRate: number
    avgResponseTime: number
  }
  health: {
    status: string
    components: Record<string, string>
    uptime: string
  }
  alerts: {
    total: number
    critical: number
    warnings: number
    recent: any[]
  }
  activity: {
    recentActions: any[]
    topUsers: Array<{ userId: string; actionCount: number }>
    topDatasets: Array<{ datasetId: string; name: string; accessCount: number }>
  }
}

export interface TenantDashboard {
  tenantId: string
  tenantName: string
  metrics: DashboardMetrics
  trends: {
    apiCalls: Array<{ date: string; count: number }>
    errors: Array<{ date: string; count: number }>
    storage: Array<{ date: string; sizeGB: number }>
  }
  quota: {
    apiCalls: { used: number; limit: number; percentage: number }
    storage: { used: number; limit: number; percentage: number }
    datasets: { used: number; limit: number; percentage: number }
  }
}

export class DashboardAggregator {
  /**
   * Get complete dashboard metrics
   */
  static async getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 86400000)
    const monthAgo = new Date(today.getTime() - 30 * 86400000)

    const [
      overview,
      usageToday,
      usageWeek,
      usageMonth,
      health,
      alerts,
      activity,
    ] = await Promise.all([
      this.getOverview(tenantId),
      UsageAnalytics.getUsageMetrics(tenantId, today, now),
      UsageAnalytics.getUsageMetrics(tenantId, weekAgo, now),
      UsageAnalytics.getUsageMetrics(tenantId, monthAgo, now),
      HealthChecker.getStatusSummary(),
      AlertManager.getAlertStats(tenantId, 7),
      this.getActivity(tenantId),
    ])

    return {
      overview,
      usage: {
        apiCallsToday: usageToday.apiCalls,
        apiCallsThisWeek: usageWeek.apiCalls,
        apiCallsThisMonth: usageMonth.apiCalls,
        dataProcessedGB: Number(usageMonth.dataProcessed) / (1024 ** 3),
        errorRate: usageMonth.errorRate,
        avgResponseTime: usageMonth.avgResponseTime,
      },
      health,
      alerts: {
        total: alerts.total,
        critical: alerts.bySeverity.CRITICAL || 0,
        warnings: alerts.bySeverity.WARNING || 0,
        recent: [],
      },
      activity,
    }
  }

  /**
   * Get overview statistics
   */
  private static async getOverview(tenantId: string): Promise<{
    totalDatasets: number
    totalPolicies: number
    totalLeases: number
    activeUsers: number
    storageUsedGB: number
  }> {
    const [datasets, policies, leases, users, storage] = await Promise.all([
      prisma.dataset.count({ where: { tenantId } }),
      prisma.accessPolicy.count({ where: { clientTenantId: tenantId } }),
      prisma.dataLease.count({ where: { tenantId } }),
      prisma.auditLog.findMany({
        where: {
          tenantId,
          timestamp: { gte: new Date(Date.now() - 30 * 86400000) },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      prisma.dataset.aggregate({
        where: { tenantId },
        _sum: { totalSizeBytes: true },
      }),
    ])

    return {
      totalDatasets: datasets,
      totalPolicies: policies,
      totalLeases: leases,
      activeUsers: users.length,
      storageUsedGB: Number(storage._sum.totalSizeBytes || 0) / (1024 ** 3),
    }
  }

  /**
   * Get activity metrics
   */
  private static async getActivity(tenantId: string): Promise<{
    recentActions: any[]
    topUsers: Array<{ userId: string; actionCount: number }>
    topDatasets: Array<{ datasetId: string; name: string; accessCount: number }>
  }> {
    const recentActions = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: {
        action: true,
        resourceType: true,
        resourceId: true,
        timestamp: true,
        userId: true,
      },
    })

    // Get top users
    const userActions = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        tenantId,
        timestamp: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      _count: true,
      orderBy: { _count: { userId: 'desc' } },
      take: 5,
    })

    const topUsers = userActions
      .filter(u => u.userId)
      .map(u => ({
        userId: u.userId!,
        actionCount: u._count,
      }))

    // Get top datasets
    const datasetAccess = await prisma.auditLog.groupBy({
      by: ['resourceId'],
      where: {
        tenantId,
        resourceType: 'DATASET',
        timestamp: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      _count: true,
      orderBy: { _count: { resourceId: 'desc' } },
      take: 5,
    })

    const datasetIds = datasetAccess.map(d => d.resourceId).filter(Boolean) as string[]
    const datasets = await prisma.dataset.findMany({
      where: { id: { in: datasetIds } },
      select: { id: true, name: true },
    })

    const datasetMap = new Map(datasets.map(d => [d.id, d.name]))
    const topDatasets = datasetAccess.map(d => ({
      datasetId: d.resourceId!,
      name: datasetMap.get(d.resourceId!) || 'Unknown',
      accessCount: d._count,
    }))

    return {
      recentActions,
      topUsers,
      topDatasets,
    }
  }

  /**
   * Get tenant dashboard
   */
  static async getTenantDashboard(tenantId: string): Promise<TenantDashboard> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    })

    const [metrics, trends, quota] = await Promise.all([
      this.getDashboardMetrics(tenantId),
      this.getTrends(tenantId),
      this.getQuotaUsage(tenantId),
    ])

    return {
      tenantId,
      tenantName: tenant?.name || 'Unknown',
      metrics,
      trends,
      quota,
    }
  }

  /**
   * Get usage trends
   */
  private static async getTrends(tenantId: string): Promise<{
    apiCalls: Array<{ date: string; count: number }>
    errors: Array<{ date: string; count: number }>
    storage: Array<{ date: string; sizeGB: number }>
  }> {
    const trends = await UsageAnalytics.getUsageTrends(tenantId, 30)

    return {
      apiCalls: trends.map(t => ({ date: t.date, count: t.apiCalls })),
      errors: trends.map(t => ({ date: t.date, count: t.errors })),
      storage: trends.map(t => ({ date: t.date, sizeGB: t.dataProcessed / (1024 ** 3) })),
    }
  }

  /**
   * Get quota usage
   */
  private static async getQuotaUsage(tenantId: string): Promise<{
    apiCalls: { used: number; limit: number; percentage: number }
    storage: { used: number; limit: number; percentage: number }
    datasets: { used: number; limit: number; percentage: number }
  }> {
    // Get current usage
    const [apiCallsToday, storage, datasets] = await Promise.all([
      UsageAnalytics.getRealTimeMetrics(tenantId),
      prisma.dataset.aggregate({
        where: { tenantId },
        _sum: { totalSizeBytes: true },
      }),
      prisma.dataset.count({ where: { tenantId } }),
    ])

    // Default limits (would come from tenant plan)
    const limits = {
      apiCalls: 10000,
      storageGB: 100,
      datasets: 50,
    }

    const storageGB = Number(storage._sum.totalSizeBytes || 0) / (1024 ** 3)

    return {
      apiCalls: {
        used: apiCallsToday.currentDayApiCalls,
        limit: limits.apiCalls,
        percentage: (apiCallsToday.currentDayApiCalls / limits.apiCalls) * 100,
      },
      storage: {
        used: storageGB,
        limit: limits.storageGB,
        percentage: (storageGB / limits.storageGB) * 100,
      },
      datasets: {
        used: datasets,
        limit: limits.datasets,
        percentage: (datasets / limits.datasets) * 100,
      },
    }
  }

  /**
   * Get real-time dashboard
   */
  static async getRealTimeDashboard(tenantId: string): Promise<{
    currentApiCalls: number
    currentErrors: number
    activeConnections: number
    queuedJobs: number
    systemHealth: string
  }> {
    const [realTime, health] = await Promise.all([
      UsageAnalytics.getRealTimeMetrics(tenantId),
      HealthChecker.checkHealth(),
    ])

    return {
      currentApiCalls: realTime.currentHourApiCalls,
      currentErrors: realTime.recentErrors,
      activeConnections: realTime.activeNow,
      queuedJobs: 0, // Would query job queue
      systemHealth: health.status,
    }
  }

  /**
   * Get compliance dashboard
   */
  static async getComplianceDashboard(tenantId: string): Promise<{
    consentRecords: number
    verifiedConsents: number
    unverifiedConsents: number
    complianceScore: number
    recentAudits: any[]
    dataRetention: {
      policiesActive: number
      recordsScheduledDeletion: number
    }
  }> {
    const now = new Date()
    const monthAgo = new Date(now.getTime() - 30 * 86400000)

    const complianceReport = await AuditViewer.getComplianceReport(
      tenantId,
      monthAgo,
      now
    )

    return {
      consentRecords: 0, // Would query consent table
      verifiedConsents: 0,
      unverifiedConsents: 0,
      complianceScore: complianceReport.complianceScore,
      recentAudits: [],
      dataRetention: {
        policiesActive: 4, // Default policies
        recordsScheduledDeletion: 0,
      },
    }
  }

  /**
   * Get performance dashboard
   */
  static async getPerformanceDashboard(tenantId: string): Promise<{
    avgResponseTime: number
    p95ResponseTime: number
    p99ResponseTime: number
    throughput: number
    errorRate: number
    slowestEndpoints: Array<{ endpoint: string; avgTime: number }>
  }> {
    const metrics = await UsageAnalytics.getUsageMetrics(
      tenantId,
      new Date(Date.now() - 24 * 3600000),
      new Date()
    )

    return {
      avgResponseTime: metrics.avgResponseTime,
      p95ResponseTime: metrics.avgResponseTime * 1.5, // Approximation
      p99ResponseTime: metrics.avgResponseTime * 2, // Approximation
      throughput: metrics.apiCalls / 24, // Per hour
      errorRate: metrics.errorRate,
      slowestEndpoints: metrics.topEndpoints.map(e => ({
        endpoint: e.endpoint,
        avgTime: metrics.avgResponseTime * 1.2, // Approximation
      })),
    }
  }

  /**
   * Export dashboard data
   */
  static async exportDashboard(
    tenantId: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const dashboard = await this.getTenantDashboard(tenantId)

    if (format === 'json') {
      return JSON.stringify(dashboard, null, 2)
    }

    // CSV format (simplified)
    const lines = [
      'Metric,Value',
      `Total Datasets,${dashboard.metrics.overview.totalDatasets}`,
      `Total Policies,${dashboard.metrics.overview.totalPolicies}`,
      `Active Users,${dashboard.metrics.overview.activeUsers}`,
      `Storage Used (GB),${dashboard.metrics.overview.storageUsedGB.toFixed(2)}`,
      `API Calls Today,${dashboard.metrics.usage.apiCallsToday}`,
      `API Calls This Week,${dashboard.metrics.usage.apiCallsThisWeek}`,
      `API Calls This Month,${dashboard.metrics.usage.apiCallsThisMonth}`,
      `Error Rate,${dashboard.metrics.usage.errorRate.toFixed(2)}%`,
      `Avg Response Time,${dashboard.metrics.usage.avgResponseTime.toFixed(0)}ms`,
    ]

    return lines.join('\n')
  }
}
