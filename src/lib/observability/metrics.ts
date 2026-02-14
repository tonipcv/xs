/**
 * OBSERVABILITY - PROMETHEUS METRICS
 * 
 * Exposes key metrics for monitoring:
 * - API latency (p50, p95, p99)
 * - Request rate
 * - Error rate
 * - Epsilon budget consumption
 * - Policy enforcement
 * - Consent revocations
 */

// @ts-nocheck
/**
 * Metrics Collection and Aggregation
 * Provides standardized metrics for monitoring and observability
 */

import { getRedisClient } from '@/lib/redis'

export interface MetricPoint {
  name: string
  value: number
  labels?: Record<string, string>
  timestamp: number
}

export class ObservabilityMetrics {
  private static readonly METRICS_PREFIX = 'xase_'
  private static readonly RETENTION_SECONDS = 3600 // 1 hour

  /**
   * Record API latency
   */
  static async recordLatency(params: {
    endpoint: string
    method: string
    statusCode: number
    durationMs: number
  }): Promise<void> {
    const { endpoint, method, statusCode, durationMs } = params
    const redis = await getRedisClient()

    const key = `${this.METRICS_PREFIX}api_latency:${endpoint}:${method}`
    const timestamp = Date.now()

    // Store latency with timestamp
    await redis.zAdd(key, [{ score: timestamp, value: durationMs.toString() }])
    await redis.expire(key, this.RETENTION_SECONDS)

    // Increment request counter
    await this.incrementCounter('api_requests_total', {
      endpoint,
      method,
      status: statusCode.toString(),
    })
  }

  /**
   * Record epsilon budget consumption
   */
  static async recordEpsilonConsumption(params: {
    tenantId: string
    datasetId: string
    epsilon: number
    purpose: string
  }): Promise<void> {
    const { tenantId, datasetId, epsilon, purpose } = params
    const redis = await getRedisClient()

    const key = `${this.METRICS_PREFIX}epsilon_consumed:${tenantId}:${datasetId}`
    
    // Increment total epsilon consumed
    await redis.incrByFloat(key, epsilon)
    await redis.expire(key, this.RETENTION_SECONDS)

    // Record by purpose
    await this.incrementCounter('epsilon_consumption_total', {
      tenant_id: tenantId,
      purpose,
    })
  }

  /**
   * Record policy enforcement
   */
  static async recordPolicyEnforcement(params: {
    policyId: string
    action: 'allowed' | 'denied'
    reason?: string
  }): Promise<void> {
    const { policyId, action, reason } = params

    await this.incrementCounter('policy_enforcements_total', {
      policy_id: policyId,
      action,
      reason: reason || 'none',
    })
  }

  /**
   * Record consent revocation
   */
  static async recordConsentRevocation(params: {
    tenantId: string
    datasetId: string
    leasesRevoked: number
  }): Promise<void> {
    const { tenantId, datasetId, leasesRevoked } = params

    await this.incrementCounter('consent_revocations_total', {
      tenant_id: tenantId,
    })

    await this.incrementCounter('leases_revoked_total', {
      tenant_id: tenantId,
    }, leasesRevoked)
  }

  /**
   * Record k-anonymity violation
   */
  static async recordKAnonymityViolation(params: {
    tenantId: string
    rowCount: number
    kMin: number
  }): Promise<void> {
    const { tenantId, rowCount, kMin } = params

    await this.incrementCounter('k_anonymity_violations_total', {
      tenant_id: tenantId,
      k_min: kMin.toString(),
    })
  }

  /**
   * Get API latency percentiles
   */
  static async getLatencyPercentiles(params: {
    endpoint: string
    method: string
    percentiles: number[]
  }): Promise<Record<string, number>> {
    const { endpoint, method, percentiles } = params
    const redis = await getRedisClient()

    const key = `${this.METRICS_PREFIX}api_latency:${endpoint}:${method}`
    const now = Date.now()
    const oneHourAgo = now - this.RETENTION_SECONDS * 1000

    // Get all latencies from last hour
    const latencies = await redis.zRangeByScore(key, oneHourAgo, now)
    
    if (latencies.length === 0) {
      return percentiles.reduce((acc, p) => ({ ...acc, [`p${p}`]: 0 }), {})
    }

    const sorted = latencies.map(Number).sort((a, b) => a - b)
    const result: Record<string, number> = {}

    for (const p of percentiles) {
      const index = Math.ceil((p / 100) * sorted.length) - 1
      result[`p${p}`] = sorted[Math.max(0, index)]
    }

    return result
  }

  /**
   * Get epsilon budget usage
   */
  static async getEpsilonUsage(params: {
    tenantId: string
    datasetId: string
  }): Promise<number> {
    const { tenantId, datasetId } = params
    const redis = await getRedisClient()

    const key = `${this.METRICS_PREFIX}epsilon_consumed:${tenantId}:${datasetId}`
    const value = await redis.get(key)

    return value ? parseFloat(value) : 0
  }

  /**
   * Get counter value
   */
  static async getCounter(name: string, labels?: Record<string, string>): Promise<number> {
    const redis = await getRedisClient()
    const key = this.buildCounterKey(name, labels)
    const value = await redis.get(key)
    return value ? parseInt(value, 10) : 0
  }

  /**
   * Export metrics in Prometheus format
   */
  static async exportPrometheusMetrics(): Promise<string> {
    const redis = await getRedisClient()
    const lines: string[] = []

    // Get all metric keys
    const keys = await redis.keys(`${this.METRICS_PREFIX}*`)

    for (const key of keys) {
      const value = await redis.get(key)
      if (!value) continue

      // Parse key to extract metric name and labels
      const parts = key.replace(this.METRICS_PREFIX, '').split(':')
      const metricName = parts[0]
      const labels = parts.slice(1).join(',')

      lines.push(`${this.METRICS_PREFIX}${metricName}{${labels}} ${value}`)
    }

    return lines.join('\n')
  }

  /**
   * Health check metrics
   */
  static async recordHealthCheck(params: {
    service: string
    healthy: boolean
    responseTimeMs: number
  }): Promise<void> {
    const { service, healthy, responseTimeMs } = params

    await this.incrementCounter('health_checks_total', {
      service,
      status: healthy ? 'healthy' : 'unhealthy',
    })

    const redis = await getRedisClient()
    const key = `${this.METRICS_PREFIX}health_response_time:${service}`
    await redis.set(key, responseTimeMs.toString(), { EX: this.RETENTION_SECONDS })
  }

  // Helper methods
  private static async incrementCounter(
    name: string,
    labels?: Record<string, string>,
    value: number = 1
  ): Promise<void> {
    const redis = await getRedisClient()
    const key = this.buildCounterKey(name, labels)
    await redis.incrBy(key, value)
    await redis.expire(key, this.RETENTION_SECONDS)
  }

  private static buildCounterKey(name: string, labels?: Record<string, string>): string {
    let key = `${this.METRICS_PREFIX}${name}`
    if (labels) {
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}:${v}`)
        .join(':')
      key += `:${labelStr}`
    }
    return key
  }
}

/**
 * Middleware helper to automatically record API metrics
 */
export function withMetrics<T extends (...args: any[]) => Promise<any>>(
  endpoint: string,
  method: string,
  handler: T
): T {
  return (async (...args: any[]) => {
    const start = Date.now()
    let statusCode = 200

    try {
      const result = await handler(...args)
      return result
    } catch (error: any) {
      statusCode = error.statusCode || 500
      throw error
    } finally {
      const durationMs = Date.now() - start
      await ObservabilityMetrics.recordLatency({
        endpoint,
        method,
        statusCode,
        durationMs,
      }).catch(err => console.error('[Metrics] Failed to record latency:', err))
    }
  }) as T
}
