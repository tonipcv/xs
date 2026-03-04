/**
 * Rate Limit Dashboard API
 */

import { NextRequest, NextResponse } from 'next/server'
import { RateLimitMonitor } from '@/lib/monitoring/rate-limit-monitor'
import { protectApiEndpoint } from '@/lib/security/api-protection'

export async function GET(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: true,
    requireTenant: true,
    endpoint: 'rate-limit-dashboard',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '24h'

    const [stats, timeline, topBlocked] = await Promise.all([
      RateLimitMonitor.getStats(protection.tenantId!, period),
      RateLimitMonitor.getTimeline(protection.tenantId!, period),
      RateLimitMonitor.getTopBlockedIPs(protection.tenantId!, 10),
    ])

    const response = NextResponse.json({
      stats,
      timeline,
      topBlocked,
      period,
    })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Rate limit dashboard error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rate limit data' },
      { status: 500 }
    )
  }
}
