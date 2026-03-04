/**
 * System Metrics API
 */

import { NextRequest, NextResponse } from 'next/server'
import { HealthChecker } from '@/lib/monitoring/health-checker'
import { UsageAnalytics } from '@/lib/analytics/usage-analytics'
import { protectApiEndpoint } from '@/lib/security/api-protection'

export async function GET(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: true,
    requireTenant: true,
    endpoint: 'monitoring-metrics',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')

    const [systemMetrics, usageMetrics, realTimeMetrics] = await Promise.all([
      HealthChecker.getMetrics(),
      UsageAnalytics.getUsageMetrics(
        protection.tenantId!,
        new Date(Date.now() - days * 86400000),
        new Date()
      ),
      UsageAnalytics.getRealTimeMetrics(protection.tenantId!),
    ])

    const response = NextResponse.json({
      system: systemMetrics,
      usage: usageMetrics,
      realTime: realTimeMetrics,
    })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Metrics error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}
