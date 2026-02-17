import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'
import { ObservabilityMetrics } from '@/lib/observability/metrics'

/**
 * Detailed Health Check
 * GET /api/v1/health/detailed
 * 
 * Returns comprehensive health status of all system components
 */
export async function GET(req: NextRequest) {
  const checks: Record<string, any> = {}
  let overallHealthy = true
  const startTime = Date.now()

  // 1. Database health
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const dbTime = Date.now() - dbStart
    checks.database = {
      status: 'healthy',
      responseTime: dbTime,
    }
    await ObservabilityMetrics.recordHealthCheck({
      service: 'database',
      healthy: true,
      responseTimeMs: dbTime,
    })
  } catch (error: any) {
    checks.database = {
      status: 'unhealthy',
      error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}),
    }
    overallHealthy = false
    await ObservabilityMetrics.recordHealthCheck({
      service: 'database',
      healthy: false,
      responseTimeMs: 0,
    })
  }

  // 2. Redis health
  try {
    const redisStart = Date.now()
    const redis = await getRedisClient()
    await redis.ping()
    const redisTime = Date.now() - redisStart
    checks.redis = {
      status: 'healthy',
      responseTime: redisTime,
    }
    await ObservabilityMetrics.recordHealthCheck({
      service: 'redis',
      healthy: true,
      responseTimeMs: redisTime,
    })
  } catch (error: any) {
    checks.redis = {
      status: 'unhealthy',
      error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}),
    }
    overallHealthy = false
    await ObservabilityMetrics.recordHealthCheck({
      service: 'redis',
      healthy: false,
      responseTimeMs: 0,
    })
  }

  // 3. Federated Agent health
  const federatedAgentUrl = process.env.FEDERATED_AGENT_URL
  if (federatedAgentUrl) {
    try {
      const agentStart = Date.now()
      const response = await fetch(`${federatedAgentUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      const agentTime = Date.now() - agentStart
      
      if (response.ok) {
        checks.federatedAgent = {
          status: 'healthy',
          responseTime: agentTime,
        }
        await ObservabilityMetrics.recordHealthCheck({
          service: 'federated_agent',
          healthy: true,
          responseTimeMs: agentTime,
        })
      } else {
        checks.federatedAgent = {
          status: 'unhealthy',
          statusCode: response.status,
        }
        overallHealthy = false
      }
    } catch (error: any) {
      checks.federatedAgent = {
        status: 'unhealthy',
        error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}),
      }
      overallHealthy = false
      await ObservabilityMetrics.recordHealthCheck({
        service: 'federated_agent',
        healthy: false,
        responseTimeMs: 0,
      })
    }
  } else {
    checks.federatedAgent = {
      status: 'not_configured',
    }
  }

  // 4. System metrics
  try {
    const metrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
    }
    checks.system = {
      status: 'healthy',
      metrics,
    }
  } catch (error: any) {
    checks.system = {
      status: 'unhealthy',
      error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}),
    }
  }

  // 5. API latency check
  try {
    const latencies = await ObservabilityMetrics.getLatencyPercentiles({
      endpoint: '/api/v1/datasets',
      method: 'GET',
      percentiles: [50, 95, 99],
    })
    checks.apiLatency = {
      status: latencies.p95 < 5000 ? 'healthy' : 'degraded',
      percentiles: latencies,
    }
  } catch (error: any) {
    checks.apiLatency = {
      status: 'unknown',
      error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}),
    }
  }

  const totalTime = Date.now() - startTime

  return NextResponse.json({
    status: overallHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    responseTime: totalTime,
    checks,
  }, {
    status: overallHealthy ? 200 : 503,
  })
}
