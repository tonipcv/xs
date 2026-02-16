import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const TelemetryLogSchema = z.object({
  segmentId: z.string(),
  timestamp: z.string().datetime(),
  eventType: z.enum(['download', 'watermark', 'serve', 'cache_hit', 'cache_miss', 'error']),
  bytesProcessed: z.number().optional(),
  latencyMs: z.number().optional(),
  metadata: z.record(z.any()).optional(),
})

const BodySchema = z.object({
  sessionId: z.string().min(1),
  logs: z.array(TelemetryLogSchema).min(1).max(1000),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { sessionId, logs } = parsed.data

    // Validate session exists and is active
    const session = await prisma.sidecarSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session not active' }, { status: 403 })
    }

    // Aggregate metrics instead of writing per-event logs (moved to TSDB)
    const totalBytes = logs.reduce((sum, log) => sum + (log.bytesProcessed || 0), 0)
    const serveCount = logs.filter(l => l.eventType === 'serve').length
    const cacheHits = logs.filter(l => l.eventType === 'cache_hit').length
    const cacheMiss = logs.filter(l => l.eventType === 'cache_miss').length
    const latencies = logs.map(l => l.latencyMs).filter((v): v is number => typeof v === 'number')
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0
    const cacheHitRate = (cacheHits + cacheMiss) > 0 ? cacheHits / (cacheHits + cacheMiss) : 0

    const windowEnd = new Date()
    const windowStart = new Date(windowEnd.getTime() - 10_000) // approx 10s window

    // Create aggregated metrics
    await prisma.sidecarMetric.createMany({
      data: [
        {
          sidecarSessionId: sessionId,
          metricType: 'throughput',
          metricValue: totalBytes,
          windowStart,
          windowEnd,
        },
        {
          sidecarSessionId: sessionId,
          metricType: 'latency',
          metricValue: avgLatency,
          windowStart,
          windowEnd,
        },
        {
          sidecarSessionId: sessionId,
          metricType: 'cache_hit_rate',
          metricValue: cacheHitRate,
          windowStart,
          windowEnd,
        },
      ],
    })

    // Update session heartbeat and counters
    await prisma.sidecarSession.update({
      where: { id: sessionId },
      data: {
        lastHeartbeat: new Date(),
        totalBytesServed: { increment: BigInt(totalBytes) },
        totalSegmentsServed: { increment: serveCount },
      },
    })

    return NextResponse.json({ 
      success: true, 
      logsReceived: logs.length,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] POST /api/v1/sidecar/telemetry error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    // Get session with recent telemetry
    const session = await prisma.sidecarSession.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const metrics = await prisma.sidecarMetric.findMany({
      where: { sidecarSessionId: sessionId },
      orderBy: { windowStart: 'desc' },
      take: 100,
    })

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
        lastHeartbeat: session.lastHeartbeat,
        totalBytesServed: session.totalBytesServed.toString(),
        totalSegmentsServed: session.totalSegmentsServed,
        trustLevel: session.trustLevel,
        attested: session.attested,
      },
      recentMetrics: metrics.map(m => ({
        metricType: m.metricType,
        metricValue: m.metricValue,
        windowStart: m.windowStart,
        windowEnd: m.windowEnd,
      })),
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] GET /api/v1/sidecar/telemetry error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
