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
    // Map period to hours
    const hours = (() => {
      switch (period) {
        case '1h': return 1
        case '6h': return 6
        case '24h': return 24
        case '7d': return 7 * 24
        case '30d': return 30 * 24
        default: {
          const n = parseInt(period, 10)
          return Number.isFinite(n) && n > 0 ? n : 24
        }
      }
    })()

    const [stats, timeline, topBlocked] = await Promise.all([
      RateLimitMonitor.getStats(protection.tenantId!, hours),
      RateLimitMonitor.getTimeline(protection.tenantId!, hours),
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
