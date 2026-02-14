import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Prometheus metrics endpoint for Sidecar observability
 * 
 * Exposes metrics in Prometheus text format:
 * - sidecar_sessions_total
 * - sidecar_bytes_served_total
 * - sidecar_segments_served_total
 * - sidecar_cache_hit_rate
 * - sidecar_avg_latency_ms
 */
export async function GET(req: NextRequest) {
  try {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Active sessions
    const activeSessions = await prisma.sidecarSession.count({
      where: { status: 'active' },
    })

    // Total sessions (last 24h)
    const totalSessions = await prisma.sidecarSession.count({
      where: { startedAt: { gte: last24h } },
    })

    // Aggregate metrics (last 24h)
    const metrics = await prisma.sidecarMetric.aggregate({
      where: {
        windowStart: { gte: last24h },
      },
      _sum: {
        metricValue: true,
      },
      _avg: {
        metricValue: true,
      },
    })

    // Bytes served (last 24h)
    const bytesServed = await prisma.sidecarMetric.aggregate({
      where: {
        metricType: 'throughput',
        windowStart: { gte: last24h },
      },
      _sum: {
        metricValue: true,
      },
    })

    // Cache hit rate (last 24h)
    const cacheHitRate = await prisma.sidecarMetric.aggregate({
      where: {
        metricType: 'cache_hit_rate',
        windowStart: { gte: last24h },
      },
      _avg: {
        metricValue: true,
      },
    })

    // Avg latency (last 24h)
    const avgLatency = await prisma.sidecarMetric.aggregate({
      where: {
        metricType: 'latency',
        windowStart: { gte: last24h },
      },
      _avg: {
        metricValue: true,
      },
    })

    // Segments served (last 24h)
    const sessions = await prisma.sidecarSession.aggregate({
      where: { startedAt: { gte: last24h } },
      _sum: {
        totalSegmentsServed: true,
      },
    })

    // Build Prometheus text format
    const lines: string[] = []

    // HELP and TYPE
    lines.push('# HELP sidecar_sessions_active Number of active Sidecar sessions')
    lines.push('# TYPE sidecar_sessions_active gauge')
    lines.push(`sidecar_sessions_active ${activeSessions}`)
    lines.push('')

    lines.push('# HELP sidecar_sessions_total Total Sidecar sessions (last 24h)')
    lines.push('# TYPE sidecar_sessions_total counter')
    lines.push(`sidecar_sessions_total ${totalSessions}`)
    lines.push('')

    lines.push('# HELP sidecar_bytes_served_total Total bytes served (last 24h)')
    lines.push('# TYPE sidecar_bytes_served_total counter')
    lines.push(`sidecar_bytes_served_total ${bytesServed._sum.metricValue || 0}`)
    lines.push('')

    lines.push('# HELP sidecar_segments_served_total Total segments served (last 24h)')
    lines.push('# TYPE sidecar_segments_served_total counter')
    lines.push(`sidecar_segments_served_total ${sessions._sum.totalSegmentsServed || 0}`)
    lines.push('')

    lines.push('# HELP sidecar_cache_hit_rate Cache hit rate (0-1, last 24h)')
    lines.push('# TYPE sidecar_cache_hit_rate gauge')
    lines.push(`sidecar_cache_hit_rate ${cacheHitRate._avg.metricValue || 0}`)
    lines.push('')

    lines.push('# HELP sidecar_avg_latency_ms Average latency in milliseconds (last 24h)')
    lines.push('# TYPE sidecar_avg_latency_ms gauge')
    lines.push(`sidecar_avg_latency_ms ${avgLatency._avg.metricValue || 0}`)
    lines.push('')

    // Return as plain text
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] GET /api/v1/metrics error:', msg)
    return new NextResponse('# Error fetching metrics\n', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  }
}
