/**
 * API endpoint for data retention management
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { RetentionManager } from '@/lib/ingestion/retention-manager'

const retentionManager = new RetentionManager()

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const datasetId = url.searchParams.get('datasetId')
    const tenantId = url.searchParams.get('tenantId')
    const action = url.searchParams.get('action')

    if (action === 'stats' && tenantId) {
      const stats = await retentionManager.getRetentionStats(tenantId)
      return NextResponse.json(stats)
    }

    if (action === 'expiring' && tenantId) {
      const daysAhead = parseInt(url.searchParams.get('daysAhead') || '7')
      const reports = await retentionManager.getExpiringDatasets(daysAhead)
      return NextResponse.json({ reports, count: reports.length })
    }

    if (datasetId) {
      const policy = await retentionManager.getPolicy(datasetId)
      if (!policy) {
        return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
      }
      return NextResponse.json(policy)
    }

    return NextResponse.json({ error: 'datasetId or action required' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] GET /api/v1/ingestion/retention error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, datasetId, retentionDays, additionalDays } = body

    if (action === 'create') {
      const policy = await retentionManager.createPolicy({
        datasetId,
        tenantId: body.tenantId,
        retentionDays,
        autoDelete: body.autoDelete !== false,
        archiveBeforeDelete: body.archiveBeforeDelete || false,
        notifyBeforeDelete: body.notifyBeforeDelete !== false,
        notifyDaysBefore: body.notifyDaysBefore || 7,
      })
      return NextResponse.json(policy)
    }

    if (action === 'extend' && datasetId && additionalDays) {
      await retentionManager.extendRetention(datasetId, additionalDays)
      return NextResponse.json({ success: true })
    }

    if (action === 'execute' && datasetId) {
      const job = await retentionManager.executeRetentionJob(datasetId)
      return NextResponse.json(job)
    }

    if (action === 'run-all') {
      const jobs = await retentionManager.runRetentionJobs()
      return NextResponse.json({ jobs, count: jobs.length })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/ingestion/retention error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { datasetId, ...updates } = body

    if (!datasetId) {
      return NextResponse.json({ error: 'datasetId required' }, { status: 400 })
    }

    const policy = await retentionManager.updatePolicy(datasetId, updates)
    return NextResponse.json(policy)
  } catch (error: any) {
    console.error('[API] PUT /api/v1/ingestion/retention error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const datasetId = url.searchParams.get('datasetId')

    if (!datasetId) {
      return NextResponse.json({ error: 'datasetId required' }, { status: 400 })
    }

    await retentionManager.deletePolicy(datasetId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API] DELETE /api/v1/ingestion/retention error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
