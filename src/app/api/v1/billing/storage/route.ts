/**
 * Storage Billing API
 * Endpoints for storage tracking, snapshots, and metrics
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { StorageService } from '@/lib/billing/storage-service'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId')
    const action = url.searchParams.get('action')

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
    }

    // Get current storage metrics
    if (action === 'current') {
      const metrics = await StorageService.getCurrentStorage(tenantId)
      return NextResponse.json(metrics)
    }

    // Get storage usage summary for period
    if (action === 'summary') {
      const start = new Date(url.searchParams.get('start') || Date.now() - 30 * 24 * 60 * 60 * 1000)
      const end = new Date(url.searchParams.get('end') || Date.now())
      const summary = await StorageService.getUsageSummary(tenantId, start, end)
      return NextResponse.json(summary)
    }

    // Calculate GB-hours for period
    if (action === 'gb-hours') {
      const start = new Date(url.searchParams.get('start') || Date.now() - 30 * 24 * 60 * 60 * 1000)
      const end = new Date(url.searchParams.get('end') || Date.now())
      const datasetId = url.searchParams.get('datasetId') || undefined
      const gbHours = await StorageService.calculateGbHours(tenantId, start, end, datasetId)
      return NextResponse.json({ gbHours, start, end, datasetId })
    }

    // Calculate storage cost
    if (action === 'cost') {
      const gbHours = parseFloat(url.searchParams.get('gbHours') || '0')
      const pricePerGbMonth = parseFloat(url.searchParams.get('pricePerGbMonth') || '0.023')
      const cost = StorageService.calculateStorageCost(gbHours, pricePerGbMonth)
      return NextResponse.json({ gbHours, pricePerGbMonth, cost })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] GET /api/v1/billing/storage error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, tenantId, datasetId, leaseId, storageBytes, snapshotType } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
    }

    // Create storage snapshot
    if (action === 'create-snapshot') {
      if (storageBytes === undefined) {
        return NextResponse.json({ error: 'storageBytes required' }, { status: 400 })
      }

      const snapshot = await StorageService.createSnapshot({
        tenantId,
        datasetId,
        leaseId,
        storageBytes: BigInt(storageBytes),
        snapshotType: snapshotType || 'MANUAL',
      })

      return NextResponse.json(snapshot)
    }

    // Track dataset storage
    if (action === 'track-dataset') {
      if (!datasetId || storageBytes === undefined) {
        return NextResponse.json({ error: 'datasetId and storageBytes required' }, { status: 400 })
      }

      const snapshot = await StorageService.trackDatasetStorage(
        tenantId,
        datasetId,
        BigInt(storageBytes)
      )

      return NextResponse.json(snapshot)
    }

    // Track lease storage start
    if (action === 'track-lease-start') {
      if (!leaseId || !datasetId || storageBytes === undefined) {
        return NextResponse.json({ error: 'leaseId, datasetId, and storageBytes required' }, { status: 400 })
      }

      const snapshot = await StorageService.trackLeaseStorageStart(
        tenantId,
        leaseId,
        datasetId,
        BigInt(storageBytes)
      )

      return NextResponse.json(snapshot)
    }

    // Track lease storage end
    if (action === 'track-lease-end') {
      if (!leaseId || !datasetId || storageBytes === undefined || !body.hoursActive) {
        return NextResponse.json({ error: 'leaseId, datasetId, storageBytes, and hoursActive required' }, { status: 400 })
      }

      const snapshot = await StorageService.trackLeaseStorageEnd(
        tenantId,
        leaseId,
        datasetId,
        BigInt(storageBytes),
        body.hoursActive
      )

      return NextResponse.json(snapshot)
    }

    // Update dataset storage
    if (action === 'update-dataset-storage') {
      if (!datasetId || storageBytes === undefined) {
        return NextResponse.json({ error: 'datasetId and storageBytes required' }, { status: 400 })
      }

      await StorageService.updateDatasetStorage(datasetId, BigInt(storageBytes))
      return NextResponse.json({ success: true })
    }

    // Create periodic snapshots
    if (action === 'create-periodic-snapshots') {
      const count = await StorageService.createPeriodicSnapshots()
      return NextResponse.json({ success: true, snapshotsCreated: count })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/billing/storage error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
