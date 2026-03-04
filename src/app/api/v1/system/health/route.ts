/**
 * System Health Check API
 */

import { NextResponse } from 'next/server'
import { HealthChecker } from '@/lib/monitoring/health-checker'

export async function GET() {
  try {
    const health = await HealthChecker.checkAll()

    const status = health.healthy ? 200 : 503

    return NextResponse.json(health, { status })
  } catch (error) {
    console.error('[API] Health check error:', error)
    return NextResponse.json(
      {
        healthy: false,
        error: 'Health check failed',
      },
      { status: 503 }
    )
  }
}
