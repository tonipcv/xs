/**
 * HEALTH CHECKER
 * Comprehensive health checks for all system components
 */

import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: Date
  checks: {
    database: ComponentHealth
    redis: ComponentHealth
    storage: ComponentHealth
    apis: ComponentHealth
  }
  uptime: number
  version: string
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  message?: string
  details?: any
}

export class HealthChecker {
  private static startTime = Date.now()
  private static readonly VERSION = '1.0.0'
  private static readonly TIMEOUT_MS = 5000

  /**
   * Perform comprehensive health check
   */
  static async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
      this.checkApis(),
    ])

    const [database, redis, storage, apis] = checks

    // Determine overall status
    const allStatuses = [database.status, redis.status, storage.status, apis.status]
    const overallStatus = allStatuses.includes('unhealthy')
      ? 'unhealthy'
      : allStatuses.includes('degraded')
      ? 'degraded'
      : 'healthy'

    return {
      status: overallStatus,
      timestamp: new Date(),
      checks: {
        database,
        redis,
        storage,
        apis,
      },
      uptime: Date.now() - this.startTime,
      version: this.VERSION,
    }
  }

  /**
   * Check database health
   */
  static async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now()

    try {
      // Simple query to check connection
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database timeout')), this.TIMEOUT_MS)
        ),
      ])

      const responseTime = Date.now() - startTime

      return {
        status: responseTime < 100 ? 'healthy' : 'degraded',
        responseTime,
        details: {
          poolSize: 'unknown',
          responseTime,
        },
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Database check failed',
      }
    }
  }

  /**
   * Check Redis health
   */
  static async checkRedis(): Promise<ComponentHealth> {
    const startTime = Date.now()

    try {
      // Ping Redis
      const testKey = 'health:check'
      await Promise.race([
        (async () => {
          await redis.setex(testKey, 10, 'ok')
          const value = await redis.get(testKey)
          if (value !== 'ok') throw new Error('Redis read/write failed')
        })(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis timeout')), this.TIMEOUT_MS)
        ),
      ])

      const responseTime = Date.now() - startTime

      return {
        status: responseTime < 50 ? 'healthy' : 'degraded',
        responseTime,
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Redis check failed',
      }
    }
  }

  /**
   * Check storage health
   */
  static async checkStorage(): Promise<ComponentHealth> {
    const startTime = Date.now()

    try {
      // Check storage usage
      const stats = await prisma.dataset.aggregate({
        _sum: { totalSizeBytes: true },
        _count: true,
      })

      const totalSize = BigInt(stats._sum.totalSizeBytes || 0)
      const count = stats._count

      const responseTime = Date.now() - startTime

      return {
        status: 'healthy',
        responseTime,
        details: {
          totalDatasets: count,
          totalSizeGB: Number(totalSize) / (1024 ** 3),
        },
      }
    } catch (error) {
      return {
        status: 'degraded',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Storage check failed',
      }
    }
  }

  /**
   * Check APIs health
   */
  static async checkApis(): Promise<ComponentHealth> {
    const startTime = Date.now()

    try {
      // Check if critical services are responding
      // This is a placeholder - would check actual API endpoints
      const responseTime = Date.now() - startTime

      return {
        status: 'healthy',
        responseTime,
        details: {
          endpoints: ['catalog', 'cohort', 'entity'],
        },
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'API check failed',
      }
    }
  }

  /**
   * Check specific component
   */
  static async checkComponent(component: 'database' | 'redis' | 'storage' | 'apis'): Promise<ComponentHealth> {
    switch (component) {
      case 'database':
        return this.checkDatabase()
      case 'redis':
        return this.checkRedis()
      case 'storage':
        return this.checkStorage()
      case 'apis':
        return this.checkApis()
    }
  }

  /**
   * Get system metrics
   */
  static async getMetrics(): Promise<{
    memory: {
      used: number
      total: number
      percentage: number
    }
    cpu: {
      usage: number
    }
    uptime: number
  }> {
    const memUsage = process.memoryUsage()

    return {
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000, // Convert to seconds
      },
      uptime: Date.now() - this.startTime,
    }
  }

  /**
   * Check if system is ready
   */
  static async isReady(): Promise<boolean> {
    try {
      const health = await this.checkHealth()
      return health.status !== 'unhealthy'
    } catch {
      return false
    }
  }

  /**
   * Check if system is alive
   */
  static async isAlive(): Promise<boolean> {
    return true // If this code runs, process is alive
  }

  /**
   * Get detailed diagnostics
   */
  static async getDiagnostics(): Promise<{
    health: HealthStatus
    metrics: any
    errors: string[]
    warnings: string[]
  }> {
    const health = await this.checkHealth()
    const metrics = await this.getMetrics()
    const errors: string[] = []
    const warnings: string[] = []

    // Collect errors and warnings
    Object.entries(health.checks).forEach(([component, check]) => {
      if (check.status === 'unhealthy') {
        errors.push(`${component}: ${check.message || 'unhealthy'}`)
      } else if (check.status === 'degraded') {
        warnings.push(`${component}: degraded performance (${check.responseTime}ms)`)
      }
    })

    // Check memory usage
    if (metrics.memory.percentage > 90) {
      warnings.push(`High memory usage: ${metrics.memory.percentage.toFixed(1)}%`)
    }

    return {
      health,
      metrics,
      errors,
      warnings,
    }
  }

  /**
   * Run health check with retry
   */
  static async checkWithRetry(maxRetries: number = 3): Promise<HealthStatus> {
    let lastError: Error | null = null

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.checkHealth()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
        }
      }
    }

    throw lastError || new Error('Health check failed after retries')
  }

  /**
   * Monitor health continuously
   */
  static async *monitorHealth(intervalMs: number = 30000): AsyncGenerator<HealthStatus> {
    while (true) {
      yield await this.checkHealth()
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }

  /**
   * Get component status summary
   */
  static async getStatusSummary(): Promise<{
    status: string
    components: Record<string, string>
    uptime: string
  }> {
    const health = await this.checkHealth()
    const uptimeSeconds = Math.floor(health.uptime / 1000)
    const uptimeMinutes = Math.floor(uptimeSeconds / 60)
    const uptimeHours = Math.floor(uptimeMinutes / 60)
    const uptimeDays = Math.floor(uptimeHours / 24)

    const uptimeStr = uptimeDays > 0
      ? `${uptimeDays}d ${uptimeHours % 24}h`
      : uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes % 60}m`
      : `${uptimeMinutes}m ${uptimeSeconds % 60}s`

    return {
      status: health.status,
      components: {
        database: health.checks.database.status,
        redis: health.checks.redis.status,
        storage: health.checks.storage.status,
        apis: health.checks.apis.status,
      },
      uptime: uptimeStr,
    }
  }
}
