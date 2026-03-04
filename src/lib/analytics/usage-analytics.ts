/**
 * USAGE ANALYTICS
 * Track and analyze platform usage metrics
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

export interface UsageMetrics {
  period: { start: Date; end: Date }
  apiCalls: number
  dataProcessed: bigint
  storageUsed: bigint
  activeUsers: number
  topEndpoints: Array<{ endpoint: string; count: number }>
  topDatasets: Array<{ datasetId: string; name: string; accessCount: number }>
  errorRate: number
  avgResponseTime: number
}

export interface TenantUsage {
  tenantId: string
  tenantName: string
  apiCalls: number
  dataProcessed: bigint
  storageUsed: bigint
  activeDays: number
  lastActive: Date
  tier: string
}

export class UsageAnalytics {
  private static readonly METRICS_PREFIX = 'metrics:'
  private static readonly RETENTION_DAYS = 90

  /**
   * Track API call
   */
  static async trackApiCall(
    tenantId: string,
    endpoint: string,
    responseTime: number,
    statusCode: number
  ): Promise<void> {
    const now = new Date()
    const dateKey = this.getDateKey(now)
    const hourKey = this.getHourKey(now)

    // Increment counters in Redis
    const pipeline = [
      // Daily metrics
      redis.hincrby(`${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`, 'apiCalls', 1),
      redis.hincrby(`${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`, `endpoint:${endpoint}`, 1),
      redis.hincrby(`${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`, 'totalResponseTime', responseTime),
      
      // Hourly metrics
      redis.hincrby(`${this.METRICS_PREFIX}hourly:${hourKey}:${tenantId}`, 'apiCalls', 1),
      
      // Error tracking
      statusCode >= 400
        ? redis.hincrby(`${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`, 'errors', 1)
        : null,
      
      // Set expiry (90 days)
      redis.expire(`${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`, this.RETENTION_DAYS * 86400),
      redis.expire(`${this.METRICS_PREFIX}hourly:${hourKey}:${tenantId}`, 7 * 86400),
    ].filter(Boolean)

    await Promise.all(pipeline)
  }

  /**
   * Track data processing
   */
  static async trackDataProcessing(
    tenantId: string,
    datasetId: string,
    bytesProcessed: bigint
  ): Promise<void> {
    const now = new Date()
    const dateKey = this.getDateKey(now)

    await Promise.all([
      redis.hincrby(
        `${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`,
        'dataProcessed',
        Number(bytesProcessed)
      ),
      redis.hincrby(
        `${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`,
        `dataset:${datasetId}`,
        1
      ),
    ])
  }

  /**
   * Get usage metrics for period
   */
  static async getUsageMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageMetrics> {
    const dateKeys = this.getDateRange(startDate, endDate)
    
    let totalApiCalls = 0
    let totalDataProcessed = BigInt(0)
    let totalErrors = 0
    let totalResponseTime = 0
    const endpointCounts: Record<string, number> = {}
    const datasetCounts: Record<string, number> = {}

    // Aggregate metrics from Redis
    for (const dateKey of dateKeys) {
      const metrics = await redis.hgetall(`${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`)
      
      if (!metrics) continue

      totalApiCalls += parseInt(metrics.apiCalls || '0')
      totalDataProcessed += BigInt(metrics.dataProcessed || '0')
      totalErrors += parseInt(metrics.errors || '0')
      totalResponseTime += parseInt(metrics.totalResponseTime || '0')

      // Aggregate endpoints
      for (const [key, value] of Object.entries(metrics)) {
        if (key.startsWith('endpoint:')) {
          const endpoint = key.replace('endpoint:', '')
          endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + parseInt(value)
        }
        if (key.startsWith('dataset:')) {
          const datasetId = key.replace('dataset:', '')
          datasetCounts[datasetId] = (datasetCounts[datasetId] || 0) + parseInt(value)
        }
      }
    }

    // Get storage usage from database
    const storageStats = await prisma.dataset.aggregate({
      where: { tenantId },
      _sum: { totalSizeBytes: true },
    })

    // Get active users
    const activeUsers = await prisma.auditLog.findMany({
      where: {
        tenantId,
        timestamp: { gte: startDate, lte: endDate },
      },
      distinct: ['userId'],
      select: { userId: true },
    })

    // Sort and limit top endpoints
    const topEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Get dataset names and create top datasets
    const datasetIds = Object.keys(datasetCounts)
    const datasets = await prisma.dataset.findMany({
      where: { id: { in: datasetIds } },
      select: { id: true, name: true },
    })

    const datasetMap = new Map(datasets.map(d => [d.id, d.name]))
    const topDatasets = Object.entries(datasetCounts)
      .map(([datasetId, count]) => ({
        datasetId,
        name: datasetMap.get(datasetId) || 'Unknown',
        accessCount: count,
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10)

    return {
      period: { start: startDate, end: endDate },
      apiCalls: totalApiCalls,
      dataProcessed: totalDataProcessed,
      storageUsed: BigInt(storageStats._sum.totalSizeBytes || 0),
      activeUsers: activeUsers.length,
      topEndpoints,
      topDatasets,
      errorRate: totalApiCalls > 0 ? (totalErrors / totalApiCalls) * 100 : 0,
      avgResponseTime: totalApiCalls > 0 ? totalResponseTime / totalApiCalls : 0,
    }
  }

  /**
   * Get tenant usage summary
   */
  static async getTenantUsage(
    startDate: Date,
    endDate: Date,
    limit: number = 100
  ): Promise<TenantUsage[]> {
    const tenants = await prisma.tenant.findMany({
      take: limit,
      select: {
        id: true,
        name: true,
      },
    })

    const usagePromises = tenants.map(async tenant => {
      const metrics = await this.getUsageMetrics(tenant.id, startDate, endDate)
      
      // Get last active date
      const lastLog = await prisma.auditLog.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      })

      // Count active days
      const dateKeys = this.getDateRange(startDate, endDate)
      let activeDays = 0
      for (const dateKey of dateKeys) {
        const metrics = await redis.hget(
          `${this.METRICS_PREFIX}daily:${dateKey}:${tenant.id}`,
          'apiCalls'
        )
        if (metrics && parseInt(metrics) > 0) {
          activeDays++
        }
      }

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        apiCalls: metrics.apiCalls,
        dataProcessed: metrics.dataProcessed,
        storageUsed: metrics.storageUsed,
        activeDays,
        lastActive: lastLog?.timestamp || new Date(0),
        tier: 'FREE', // Would come from tenant record
      }
    })

    const usage = await Promise.all(usagePromises)
    return usage.sort((a, b) => b.apiCalls - a.apiCalls)
  }

  /**
   * Get real-time metrics
   */
  static async getRealTimeMetrics(tenantId: string): Promise<{
    currentHourApiCalls: number
    currentDayApiCalls: number
    activeNow: number
    recentErrors: number
  }> {
    const now = new Date()
    const hourKey = this.getHourKey(now)
    const dateKey = this.getDateKey(now)

    const [hourMetrics, dayMetrics] = await Promise.all([
      redis.hgetall(`${this.METRICS_PREFIX}hourly:${hourKey}:${tenantId}`),
      redis.hgetall(`${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`),
    ])

    return {
      currentHourApiCalls: parseInt(hourMetrics?.apiCalls || '0'),
      currentDayApiCalls: parseInt(dayMetrics?.apiCalls || '0'),
      activeNow: 0, // Would track active sessions
      recentErrors: parseInt(dayMetrics?.errors || '0'),
    }
  }

  /**
   * Get usage trends
   */
  static async getUsageTrends(
    tenantId: string,
    days: number = 30
  ): Promise<Array<{
    date: string
    apiCalls: number
    dataProcessed: number
    errors: number
  }>> {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const dateKeys = this.getDateRange(startDate, endDate)
    const trends: Array<any> = []

    for (const dateKey of dateKeys) {
      const metrics = await redis.hgetall(`${this.METRICS_PREFIX}daily:${dateKey}:${tenantId}`)
      
      trends.push({
        date: dateKey,
        apiCalls: parseInt(metrics?.apiCalls || '0'),
        dataProcessed: parseInt(metrics?.dataProcessed || '0'),
        errors: parseInt(metrics?.errors || '0'),
      })
    }

    return trends
  }

  /**
   * Detect usage anomalies
   */
  static async detectAnomalies(
    tenantId: string,
    days: number = 7
  ): Promise<Array<{
    type: string
    description: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    value: number
    threshold: number
  }>> {
    const trends = await this.getUsageTrends(tenantId, days)
    const anomalies: Array<any> = []

    if (trends.length === 0) return anomalies

    // Calculate averages
    const avgApiCalls = trends.reduce((sum, t) => sum + t.apiCalls, 0) / trends.length
    const avgErrors = trends.reduce((sum, t) => sum + t.errors, 0) / trends.length

    // Check latest day
    const latest = trends[trends.length - 1]

    // Spike in API calls
    if (latest.apiCalls > avgApiCalls * 3) {
      anomalies.push({
        type: 'API_SPIKE',
        description: 'Unusual spike in API calls detected',
        severity: 'MEDIUM',
        value: latest.apiCalls,
        threshold: avgApiCalls * 3,
      })
    }

    // High error rate
    const errorRate = latest.apiCalls > 0 ? (latest.errors / latest.apiCalls) * 100 : 0
    if (errorRate > 10) {
      anomalies.push({
        type: 'HIGH_ERROR_RATE',
        description: 'Error rate exceeds 10%',
        severity: 'HIGH',
        value: errorRate,
        threshold: 10,
      })
    }

    // Sudden drop in usage
    if (latest.apiCalls < avgApiCalls * 0.1 && avgApiCalls > 100) {
      anomalies.push({
        type: 'USAGE_DROP',
        description: 'Significant drop in API usage',
        severity: 'MEDIUM',
        value: latest.apiCalls,
        threshold: avgApiCalls * 0.1,
      })
    }

    return anomalies
  }

  /**
   * Helper: Get date key
   */
  private static getDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  /**
   * Helper: Get hour key
   */
  private static getHourKey(date: Date): string {
    return `${this.getDateKey(date)}-${String(date.getHours()).padStart(2, '0')}`
  }

  /**
   * Helper: Get date range
   */
  private static getDateRange(startDate: Date, endDate: Date): string[] {
    const dates: string[] = []
    const current = new Date(startDate)

    while (current <= endDate) {
      dates.push(this.getDateKey(current))
      current.setDate(current.getDate() + 1)
    }

    return dates
  }

  /**
   * Cleanup old metrics
   */
  static async cleanupOldMetrics(): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS)

    const pattern = `${this.METRICS_PREFIX}*`
    const keys = await redis.keys(pattern)
    
    let deleted = 0
    for (const key of keys) {
      const ttl = await redis.ttl(key)
      if (ttl === -1) {
        // No expiry set, delete if old
        await redis.del(key)
        deleted++
      }
    }

    return deleted
  }
}
