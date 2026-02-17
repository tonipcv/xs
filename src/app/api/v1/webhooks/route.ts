/**
 * API endpoint for webhook management
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WebhookService } from '@/lib/billing/webhook-service'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const webhookId = url.searchParams.get('webhookId')
    const action = url.searchParams.get('action')

    if (action === 'deliveries' && webhookId) {
      const deliveries = await WebhookService.getDeliveries(webhookId)
      return NextResponse.json({ deliveries, count: deliveries.length })
    }

    if (action === 'test' && webhookId) {
      const result = await WebhookService.testWebhook(webhookId)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] GET /api/v1/webhooks error:', error)
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
    const { action, tenantId, url, events } = body

    if (action === 'register') {
      const webhook = await WebhookService.registerWebhook(tenantId, url, events)
      return NextResponse.json(webhook, { status: 201 })
    }

    if (action === 'retry') {
      await WebhookService.retryWebhook(body.deliveryId)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/webhooks error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
