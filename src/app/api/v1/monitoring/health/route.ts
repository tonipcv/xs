/**
 * Health Check API
 */

import { NextRequest, NextResponse } from 'next/server'
import { HealthChecker } from '@/lib/monitoring/health-checker'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const detailed = searchParams.get('detailed') === 'true'

    if (detailed) {
      const diagnostics = await HealthChecker.getDiagnostics()
      return NextResponse.json(diagnostics)
    }

    const health = await HealthChecker.checkHealth()
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503

    return NextResponse.json(health, { status: statusCode })
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: 'Health check failed' },
      { status: 503 }
    )
  }
}
