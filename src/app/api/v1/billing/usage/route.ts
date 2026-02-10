/**
 * API endpoint for usage metering and billing
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { MeteringService } from '@/lib/billing/metering-service'

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

    if (action === 'realtime') {
      const usage = await MeteringService.getRealTimeUsage(tenantId)
      return NextResponse.json({ usage })
    }

    if (action === 'summary') {
      const start = new Date(url.searchParams.get('start') || Date.now() - 30 * 24 * 60 * 60 * 1000)
      const end = new Date(url.searchParams.get('end') || Date.now())
      const summary = await MeteringService.getUsageSummary(tenantId, start, end)
      return NextResponse.json(summary)
    }

    if (action === 'events') {
      const start = new Date(url.searchParams.get('start') || Date.now() - 30 * 24 * 60 * 60 * 1000)
      const end = new Date(url.searchParams.get('end') || Date.now())
      const events = await MeteringService.getBillingEvents(tenantId, start, end)
      return NextResponse.json({ events, count: events.length })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] GET /api/v1/billing/usage error:', error)
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
    const { action, tenantId, metric, value, leaseId, datasetId } = body

    if (action === 'record') {
      await MeteringService.recordUsage({
        tenantId,
        leaseId,
        datasetId,
        metric,
        value,
        timestamp: new Date(),
        metadata: body.metadata,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'calculate-bill') {
      const start = new Date(body.start)
      const end = new Date(body.end)
      const rates = body.rates || { hours: 0.1, requests: 0.001, bytes: 0.00001 }
      const bill = await MeteringService.calculateBill(tenantId, start, end, rates)
      return NextResponse.json(bill)
    }

    if (action === 'check-quota') {
      const result = await MeteringService.checkQuotaAndBill(tenantId, metric, body.limit)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/billing/usage error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
