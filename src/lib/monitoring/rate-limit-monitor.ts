/**
 * RATE LIMIT MONITOR
 * Monitor and analyze rate limiting patterns
 */

import { redis } from '@/lib/redis'

export interface RateLimitStats {
  tenant: string
  totalRequests: number
  blockedRequests: number
  blockRate: number
  topBlockedEndpoints: Array<{ endpoint: string; count: number }>
  topBlockedIPs: Array<{ ip: string; count: number }>
  timeline: Array<{ hour: string; requests: number; blocked: number }>
}

export interface RateLimitAlert {
  type: 'EXCESSIVE_BLOCKING' | 'SUSPICIOUS_PATTERN' | 'QUOTA_EXCEEDED'
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  tenantId: string
  description: string
  value: number
  threshold: number
  timestamp: Date
}

export class RateLimitMonitor {
  private static readonly STATS_PREFIX = 'ratelimit:stats:'
  private static readonly ALERT_PREFIX = 'ratelimit:alerts:'

  /**
   * Track rate limit hit
   */
  static async trackRateLimitHit(
    tenantId: string,
    endpoint: string,
    ip: string,
    blocked: boolean
  ): Promise<void> {
    const now = new Date()
    const hourKey = this.getHourKey(now)
    const statsKey = `${this.STATS_PREFIX}${hourKey}:${tenantId}`

    await Promise.all([
      // Total requests
      redis.hincrby(statsKey, 'total', 1),
      
      // Blocked requests
      blocked ? redis.hincrby(statsKey, 'blocked', 1) : null,
      
      // By endpoint
      redis.hincrby(statsKey, `endpoint:${endpoint}`, 1),
      blocked ? redis.hincrby(statsKey, `blocked:endpoint:${endpoint}`, 1) : null,
      
      // By IP
      redis.hincrby(statsKey, `ip:${ip}`, 1),
      blocked ? redis.hincrby(statsKey, `blocked:ip:${ip}`, 1) : null,
      
      // Set expiry (7 days)
      redis.expire(statsKey, 7 * 86400),
    ].filter(Boolean))
  }

  /**
   * Get rate limit statistics
   */
  static async getStats(
    tenantId: string,
    hours: number = 24
  ): Promise<RateLimitStats> {
    const now = new Date()
    const hourKeys: string[] = []

    // Get last N hours
    for (let i = 0; i < hours; i++) {
      const date = new Date(now.getTime() - i * 3600000)
      hourKeys.push(this.getHourKey(date))
    }

    let totalRequests = 0
    let blockedRequests = 0
    const endpointCounts: Record<string, number> = {}
    const ipCounts: Record<string, number> = {}
    const timeline: Array<{ hour: string; requests: number; blocked: number }> = []

    for (const hourKey of hourKeys) {
      const statsKey = `${this.STATS_PREFIX}${hourKey}:${tenantId}`
      const stats = await redis.hgetall(statsKey)

      if (!stats) {
        timeline.push({ hour: hourKey, requests: 0, blocked: 0 })
        continue
      }

      const hourTotal = parseInt(stats.total || '0')
      const hourBlocked = parseInt(stats.blocked || '0')

      totalRequests += hourTotal
      blockedRequests += hourBlocked

      timeline.push({
        hour: hourKey,
        requests: hourTotal,
        blocked: hourBlocked,
      })

      // Aggregate endpoints
      for (const [key, value] of Object.entries(stats)) {
        if (key.startsWith('blocked:endpoint:')) {
          const endpoint = key.replace('blocked:endpoint:', '')
          endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + parseInt(value)
        }
        if (key.startsWith('blocked:ip:')) {
          const ip = key.replace('blocked:ip:', '')
          ipCounts[ip] = (ipCounts[ip] || 0) + parseInt(value)
        }
      }
    }

    const topBlockedEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const topBlockedIPs = Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      tenant: tenantId,
      totalRequests,
      blockedRequests,
      blockRate: totalRequests > 0 ? (blockedRequests / totalRequests) * 100 : 0,
      topBlockedEndpoints,
      topBlockedIPs,
      timeline: timeline.reverse(),
    }
  }

  /**
   * Detect rate limit anomalies
   */
  static async detectAnomalies(tenantId: string): Promise<RateLimitAlert[]> {
    const stats = await this.getStats(tenantId, 24)
    const alerts: RateLimitAlert[] = []

    // High block rate
    if (stats.blockRate > 50) {
      alerts.push({
        type: 'EXCESSIVE_BLOCKING',
        severity: 'HIGH',
        tenantId,
        description: 'More than 50% of requests are being blocked',
        value: stats.blockRate,
        threshold: 50,
        timestamp: new Date(),
      })
    } else if (stats.blockRate > 25) {
      alerts.push({
        type: 'EXCESSIVE_BLOCKING',
        severity: 'MEDIUM',
        tenantId,
        description: 'More than 25% of requests are being blocked',
        value: stats.blockRate,
        threshold: 25,
        timestamp: new Date(),
      })
    }

    // Suspicious IP patterns
    for (const { ip, count } of stats.topBlockedIPs) {
      if (count > 1000) {
        alerts.push({
          type: 'SUSPICIOUS_PATTERN',
          severity: 'HIGH',
          tenantId,
          description: `IP ${ip} has been blocked ${count} times`,
          value: count,
          threshold: 1000,
          timestamp: new Date(),
        })
      }
    }

    // Check for sudden spikes
    const recentHours = stats.timeline.slice(-3)
    const avgBlocked = recentHours.reduce((sum, h) => sum + h.blocked, 0) / recentHours.length
    const latestBlocked = recentHours[recentHours.length - 1]?.blocked || 0

    if (latestBlocked > avgBlocked * 5 && avgBlocked > 10) {
      alerts.push({
        type: 'SUSPICIOUS_PATTERN',
        severity: 'MEDIUM',
        tenantId,
        description: 'Sudden spike in blocked requests detected',
        value: latestBlocked,
        threshold: avgBlocked * 5,
        timestamp: new Date(),
      })
    }

    return alerts
  }

  /**
   * Get top blocked tenants
   */
  static async getTopBlockedTenants(limit: number = 10): Promise<Array<{
    tenantId: string
    blockedRequests: number
    blockRate: number
  }>> {
    // This would aggregate across all tenants
    // Placeholder implementation
    return []
  }

  /**
   * Get real-time rate limit status
   */
  static async getRealTimeStatus(tenantId: string): Promise<{
    currentHourRequests: number
    currentHourBlocked: number
    blockRate: number
    isThrottled: boolean
  }> {
    const now = new Date()
    const hourKey = this.getHourKey(now)
    const statsKey = `${this.STATS_PREFIX}${hourKey}:${tenantId}`

    const stats = await redis.hgetall(statsKey)
    const total = parseInt(stats?.total || '0')
    const blocked = parseInt(stats?.blocked || '0')

    return {
      currentHourRequests: total,
      currentHourBlocked: blocked,
      blockRate: total > 0 ? (blocked / total) * 100 : 0,
      isThrottled: blocked > 0,
    }
  }

  /**
   * Get endpoint performance
   */
  static async getEndpointPerformance(
    tenantId: string,
    endpoint: string,
    hours: number = 24
  ): Promise<{
    totalRequests: number
    blockedRequests: number
    blockRate: number
    timeline: Array<{ hour: string; requests: number; blocked: number }>
  }> {
    const now = new Date()
    const timeline: Array<{ hour: string; requests: number; blocked: number }> = []
    let totalRequests = 0
    let blockedRequests = 0

    for (let i = 0; i < hours; i++) {
      const date = new Date(now.getTime() - i * 3600000)
      const hourKey = this.getHourKey(date)
      const statsKey = `${this.STATS_PREFIX}${hourKey}:${tenantId}`

      const stats = await redis.hgetall(statsKey)
      const requests = parseInt(stats?.[`endpoint:${endpoint}`] || '0')
      const blocked = parseInt(stats?.[`blocked:endpoint:${endpoint}`] || '0')

      totalRequests += requests
      blockedRequests += blocked

      timeline.push({ hour: hourKey, requests, blocked })
    }

    return {
      totalRequests,
      blockedRequests,
      blockRate: totalRequests > 0 ? (blockedRequests / totalRequests) * 100 : 0,
      timeline: timeline.reverse(),
    }
  }

  /**
   * Store alert
   */
  static async storeAlert(alert: RateLimitAlert): Promise<void> {
    const alertKey = `${this.ALERT_PREFIX}${alert.tenantId}:${Date.now()}`
    await redis.setex(alertKey, 7 * 86400, JSON.stringify(alert))
  }

  /**
   * Get recent alerts
   */
  static async getRecentAlerts(
    tenantId: string,
    limit: number = 10
  ): Promise<RateLimitAlert[]> {
    const pattern = `${this.ALERT_PREFIX}${tenantId}:*`
    const keys = await redis.keys(pattern)
    
    const alerts: RateLimitAlert[] = []
    for (const key of keys.slice(0, limit)) {
      const data = await redis.get(key)
      if (data) {
        alerts.push(JSON.parse(data))
      }
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  /**
   * Helper: Get hour key
   */
  private static getHourKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`
  }

  /**
   * Clear stats for tenant
   */
  static async clearStats(tenantId: string): Promise<number> {
    const pattern = `${this.STATS_PREFIX}*:${tenantId}`
    const keys = await redis.keys(pattern)
    
    let deleted = 0
    for (const key of keys) {
      await redis.del(key)
      deleted++
    }

    return deleted
  }

  /**
   * Export stats to JSON
   */
  static async exportStats(
    tenantId: string,
    hours: number = 24
  ): Promise<string> {
    const stats = await this.getStats(tenantId, hours)
    return JSON.stringify(stats, null, 2)
  }
}
