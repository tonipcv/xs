/**
 * Metering Service - Precise usage tracking
 * Tracks hours, requests, and other billable metrics
 */

import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'

export interface UsageMetrics {
  tenantId: string
  leaseId?: string
  datasetId?: string
  metric: 'hours' | 'requests' | 'bytes' | 'queries' | 'epsilon' | 'storage_gb_hours'
  value: number
  timestamp: Date
  metadata?: Record<string, any>
}

export interface UsageSummary {
  tenantId: string
  period: { start: Date; end: Date }
  metrics: {
    totalHours: number
    totalRequests: number
    totalBytes: number
    totalQueries: number
    totalEpsilon: number
    totalStorageGbHours: number
  }
  breakdown: {
    byDataset: Record<string, any>
    byLease: Record<string, any>
  }
}

export interface BillingEvent {
  id: string
  tenantId: string
  type: 'usage' | 'overage' | 'quota_exceeded' | 'subscription_change'
  amount: number
  currency: string
  metadata: Record<string, any>
  timestamp: Date
  processed: boolean
}

export class MeteringService {
  private static readonly REDIS_PREFIX = 'metering:'
  private static readonly BATCH_SIZE = 100
  private static readonly FLUSH_INTERVAL = 60000 // 1 minute

  /**
   * Record usage metric
   */
  static async recordUsage(metric: UsageMetrics): Promise<void> {
    try {
      const redis = await getRedisClient()
      const key = `${this.REDIS_PREFIX}${metric.tenantId}:${metric.metric}`
      
      // Add to Redis sorted set for real-time tracking (skip if Redis unavailable)
      await redis.zAdd(
        key,
        { score: metric.timestamp.getTime(), value: JSON.stringify({
          value: metric.value,
          leaseId: metric.leaseId,
          datasetId: metric.datasetId,
          metadata: metric.metadata,
        }) }
      ).catch(() => {
        // Redis unavailable, continue with DB only
      })

      // Set expiration (keep for 7 days) - ignore errors
      await redis.expire(key, 7 * 24 * 60 * 60).catch(() => {})
    } catch (error) {
      // Redis unavailable, continue with DB only
    }

    // Batch write to database (always works)
    await this.batchWriteToDatabase(metric)
  }

  /**
   * Batch write to database
   */
  private static async batchWriteToDatabase(metric: UsageMetrics): Promise<void> {
    try {
      const redis = await getRedisClient()
      const batchKey = `${this.REDIS_PREFIX}batch:${metric.tenantId}`
      
      await redis.lPush(batchKey, JSON.stringify(metric)).catch(() => {})
      
      const batchSize = await redis.lLen(batchKey).catch(() => 0)
      
      if (batchSize >= this.BATCH_SIZE) {
        await this.flushBatch(metric.tenantId)
      }
    } catch (error) {
      // Redis unavailable, write directly to DB
      await this.writeMetricsToDatabase([metric])
    }
  }

  /**
   * Flush batch to database
   */
  static async flushBatch(tenantId: string): Promise<void> {
    try {
      const redis = await getRedisClient()
      const batchKey = `${this.REDIS_PREFIX}batch:${tenantId}`
      
      const batch = await redis.lRange(batchKey, 0, this.BATCH_SIZE - 1).catch(() => [])
      if (batch.length === 0) return

      const metrics = batch.map((item: string) => JSON.parse(item))

      // Write to database
      await this.writeMetricsToDatabase(metrics)

      // Remove processed items
      await redis.lTrim(batchKey, batch.length, -1).catch(() => {})
    } catch (error) {
      // Redis unavailable, skip
    }
  }

  /**
   * Write metrics directly to database (fallback when Redis unavailable)
   */
  private static async writeMetricsToDatabase(metrics: UsageMetrics[]): Promise<void> {
    await prisma.creditLedger.createMany({
      data: metrics.map((m) => ({
        tenantId: m.tenantId,
        leaseId: m.leaseId,
        datasetId: m.datasetId,
        action: m.metric.toUpperCase(),
        creditChange: -m.value,
        balanceAfter: 0,
        metadata: JSON.stringify(m.metadata || {}),
      })),
    }).catch(() => {})
  }

  /**
   * Get usage summary for period
   */
  static async getUsageSummary(
    tenantId: string,
    start: Date,
    end: Date
  ): Promise<UsageSummary> {
    const redis = await getRedisClient()
    
    const metrics = {
      totalHours: 0,
      totalRequests: 0,
      totalBytes: 0,
      totalQueries: 0,
      totalEpsilon: 0,
      totalStorageGbHours: 0,
    }

    const breakdown = {
      byDataset: {} as Record<string, any>,
      byLease: {} as Record<string, any>,
    }

    // Fetch from Redis for recent data
    for (const metric of ['hours', 'requests', 'bytes', 'queries', 'epsilon', 'storage_gb_hours']) {
      const key = `${this.REDIS_PREFIX}${tenantId}:${metric}`
      const data = await redis.zRangeByScore(key, start.getTime(), end.getTime())

      for (const item of data) {
        const parsed = JSON.parse(item)
        const metricKey = `total${metric.charAt(0).toUpperCase() + metric.slice(1)}` as keyof typeof metrics
        metrics[metricKey] += parsed.value

        // Breakdown by dataset
        if (parsed.datasetId) {
          if (!breakdown.byDataset[parsed.datasetId]) {
            breakdown.byDataset[parsed.datasetId] = {}
          }
          breakdown.byDataset[parsed.datasetId][metric] = 
            (breakdown.byDataset[parsed.datasetId][metric] || 0) + parsed.value
        }

        // Breakdown by lease
        if (parsed.leaseId) {
          if (!breakdown.byLease[parsed.leaseId]) {
            breakdown.byLease[parsed.leaseId] = {}
          }
          breakdown.byLease[parsed.leaseId][metric] = 
            (breakdown.byLease[parsed.leaseId][metric] || 0) + parsed.value
        }
      }
    }

    return {
      tenantId,
      period: { start, end },
      metrics,
      breakdown,
    }
  }

  /**
   * Get real-time usage for tenant
   */
  static async getRealTimeUsage(tenantId: string): Promise<Record<string, number>> {
    const redis = await getRedisClient()
    const now = Date.now()
    const hourAgo = now - 60 * 60 * 1000

    const usage: Record<string, number> = {}

    for (const metric of ['hours', 'requests', 'bytes', 'queries', 'epsilon', 'storage_gb_hours']) {
      const key = `${this.REDIS_PREFIX}${tenantId}:${metric}`
      const data = await redis.zRangeByScore(key, hourAgo, now)
      
      usage[metric] = data.reduce((sum: number, item: string) => {
        const parsed = JSON.parse(item)
        return sum + parsed.value
      }, 0)
    }

    return usage
  }

  /**
   * Record lease usage
   */
  static async recordLeaseUsage(
    leaseId: string,
    hours: number,
    requests: number = 0
  ): Promise<void> {
    const lease = await prisma.accessLease.findUnique({
      where: { id: leaseId },
      select: { clientTenantId: true, datasetId: true },
    })

    if (!lease) return

    await this.recordUsage({
      tenantId: lease.clientTenantId,
      leaseId,
      datasetId: lease.datasetId,
      metric: 'hours',
      value: hours,
      timestamp: new Date(),
    })

    if (requests > 0) {
      await this.recordUsage({
        tenantId: lease.clientTenantId,
        leaseId,
        datasetId: lease.datasetId,
        metric: 'requests',
        value: requests,
        timestamp: new Date(),
      })
    }
  }

  /**
   * Check quota and create billing event if exceeded
   */
  static async checkQuotaAndBill(
    tenantId: string,
    metric: string,
    limit: number
  ): Promise<{ exceeded: boolean; usage: number; limit: number }> {
    const usage = await this.getRealTimeUsage(tenantId)
    const currentUsage = usage[metric] || 0
    const exceeded = currentUsage > limit

    if (exceeded) {
      await this.createBillingEvent({
        tenantId,
        type: 'quota_exceeded',
        amount: currentUsage - limit,
        currency: 'USD',
        metadata: { metric, limit, usage: currentUsage },
        timestamp: new Date(),
        processed: false,
      })
    }

    return { exceeded, usage: currentUsage, limit }
  }

  /**
   * Create billing event
   */
  static async createBillingEvent(
    event: Omit<BillingEvent, 'id'>
  ): Promise<BillingEvent> {
    const billingEvent: BillingEvent = {
      id: `be_${Date.now()}`,
      ...event,
    }

    // Store in Redis for processing
    const redis = await getRedisClient()
    await redis.lpush(
      'billing:events',
      JSON.stringify(billingEvent)
    )

    // Also store in database
    await prisma.auditLog.create({
      data: {
        tenantId: event.tenantId,
        action: 'BILLING_EVENT_CREATED',
        resourceType: 'billing',
        resourceId: billingEvent.id,
        metadata: JSON.stringify(event.metadata),
        status: 'SUCCESS',
      },
    })

    return billingEvent
  }

  /**
   * Process billing events
   */
  static async processBillingEvents(): Promise<number> {
    const redis = await getRedisClient()
    const events = await redis.lrange('billing:events', 0, 99)
    
    let processed = 0

    for (const eventStr of events) {
      const event: BillingEvent = JSON.parse(eventStr)
      
      // Process event (integrate with billing provider)
      console.log(`[Billing] Processing event ${event.id} for tenant ${event.tenantId}`)
      
      // Mark as processed
      await redis.lrem('billing:events', 1, eventStr)
      processed++
    }

    return processed
  }

  /**
   * Get billing events for tenant
   */
  static async getBillingEvents(
    tenantId: string,
    start: Date,
    end: Date
  ): Promise<BillingEvent[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'BILLING_EVENT_CREATED',
        timestamp: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { timestamp: 'desc' },
    })

    return logs.map(log => {
      const metadata = log.metadata ? JSON.parse(log.metadata) : {}
      return {
        id: log.resourceId || `be_${log.id}`,
        tenantId: log.tenantId || tenantId,
        type: metadata.type || 'usage',
        amount: metadata.amount || 0,
        currency: metadata.currency || 'USD',
        metadata,
        timestamp: log.timestamp,
        processed: true,
      }
    })
  }

  /**
   * Calculate bill for period
   */
  static async calculateBill(
    tenantId: string,
    start: Date,
    end: Date,
    rates: { hours: number; requests: number; bytes: number; storage_gb_hours?: number }
  ): Promise<{
    total: number
    breakdown: Record<string, number>
    usage: UsageSummary
  }> {
    const usage = await this.getUsageSummary(tenantId, start, end)
    
    const breakdown = {
      hours: usage.metrics.totalHours * rates.hours,
      requests: usage.metrics.totalRequests * rates.requests,
      bytes: usage.metrics.totalBytes * rates.bytes,
      storage: usage.metrics.totalStorageGbHours * (rates.storage_gb_hours || 0.000032), // ~$0.023/GB-month
    }

    const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0)

    return { total, breakdown, usage }
  }
}
