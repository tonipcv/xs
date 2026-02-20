/**
 * Sidecar Telemetry API
 * Receives and processes telemetry from Xase Sidecar
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SidecarTelemetryService } from '@/lib/billing/sidecar-telemetry'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, telemetry, telemetryBatch } = body

    // Process single telemetry
    if (action === 'process' && telemetry) {
      const processed = await SidecarTelemetryService.processTelemetry({
        sessionId: telemetry.sessionId,
        leaseId: telemetry.leaseId,
        tenantId: telemetry.tenantId,
        datasetId: telemetry.datasetId,
        bytesProcessed: BigInt(telemetry.bytesProcessed || 0),
        recordsProcessed: telemetry.recordsProcessed || 0,
        startTime: new Date(telemetry.startTime),
        endTime: telemetry.endTime ? new Date(telemetry.endTime) : undefined,
        computeSeconds: telemetry.computeSeconds,
        storageBytes: BigInt(telemetry.storageBytes || 0),
        peakStorageBytes: telemetry.peakStorageBytes ? BigInt(telemetry.peakStorageBytes) : undefined,
        policiesApplied: telemetry.policiesApplied || [],
        watermarksApplied: telemetry.watermarksApplied || 0,
        errors: telemetry.errors,
      })

      return NextResponse.json(processed)
    }

    // Process batch telemetry
    if (action === 'process-batch' && telemetryBatch) {
      const batch = telemetryBatch.map((t: any) => ({
        sessionId: t.sessionId,
        leaseId: t.leaseId,
        tenantId: t.tenantId,
        datasetId: t.datasetId,
        bytesProcessed: BigInt(t.bytesProcessed || 0),
        recordsProcessed: t.recordsProcessed || 0,
        startTime: new Date(t.startTime),
        endTime: t.endTime ? new Date(t.endTime) : undefined,
        computeSeconds: t.computeSeconds,
        storageBytes: BigInt(t.storageBytes || 0),
        peakStorageBytes: t.peakStorageBytes ? BigInt(t.peakStorageBytes) : undefined,
        policiesApplied: t.policiesApplied || [],
        watermarksApplied: t.watermarksApplied || 0,
        errors: t.errors,
      }))

      const processed = await SidecarTelemetryService.processBatchTelemetry(batch)
      return NextResponse.json({ processed, count: processed.length })
    }

    // Create periodic snapshots
    if (action === 'create-periodic-snapshots') {
      const count = await SidecarTelemetryService.createPeriodicSnapshots()
      return NextResponse.json({ success: true, snapshotsCreated: count })
    }

    return NextResponse.json({ error: 'Invalid action or missing data' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/billing/telemetry error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const leaseId = url.searchParams.get('leaseId')

    if (!leaseId) {
      return NextResponse.json({ error: 'leaseId required' }, { status: 400 })
    }

    const summary = await SidecarTelemetryService.getLeaseTelemetrySummary(leaseId)
    return NextResponse.json(summary)
  } catch (error: any) {
    console.error('[API] GET /api/v1/billing/telemetry error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
