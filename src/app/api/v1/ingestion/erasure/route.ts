/**
 * API endpoint for GDPR erasure workflow
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ErasureWorkflow } from '@/lib/ingestion/erasure-workflow'

const erasureWorkflow = new ErasureWorkflow()

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const requestId = url.searchParams.get('requestId')
    const tenantId = url.searchParams.get('tenantId')
    const action = url.searchParams.get('action')

    if (action === 'stats' && tenantId) {
      const stats = await erasureWorkflow.getErasureStats(tenantId)
      return NextResponse.json(stats)
    }

    if (action === 'report' && requestId) {
      const report = await erasureWorkflow.generateReport(requestId)
      return NextResponse.json(report)
    }

    if (action === 'verify' && requestId) {
      const verification = await erasureWorkflow.verifyErasure(requestId)
      return NextResponse.json(verification)
    }

    if (requestId) {
      const request = await erasureWorkflow.getRequest(requestId)
      if (!request) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 })
      }
      return NextResponse.json(request)
    }

    if (tenantId) {
      const requests = await erasureWorkflow.listRequests(tenantId)
      return NextResponse.json({ requests, count: requests.length })
    }

    return NextResponse.json({ error: 'requestId or tenantId required' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] GET /api/v1/ingestion/erasure error:', error)
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
    const { action, requestId } = body

    if (action === 'create') {
      const request = await erasureWorkflow.createRequest({
        tenantId: body.tenantId,
        userId: body.userId,
        datasetId: body.datasetId,
        reason: body.reason || 'user_request',
        requestedBy: session.user.email || 'unknown',
      })
      return NextResponse.json(request, { status: 201 })
    }

    if (action === 'approve' && requestId) {
      const request = await erasureWorkflow.approveRequest(
        requestId,
        session.user.email || 'unknown'
      )
      return NextResponse.json(request)
    }

    if (action === 'reject' && requestId) {
      const request = await erasureWorkflow.rejectRequest(
        requestId,
        session.user.email || 'unknown',
        body.reason || 'No reason provided'
      )
      return NextResponse.json(request)
    }

    if (action === 'execute' && requestId) {
      const result = await erasureWorkflow.executeErasure(requestId)
      return NextResponse.json(result)
    }

    if (action === 'schedule' && requestId && body.scheduledFor) {
      await erasureWorkflow.scheduleErasure(requestId, new Date(body.scheduledFor))
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/ingestion/erasure error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
