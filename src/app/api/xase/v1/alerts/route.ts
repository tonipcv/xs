import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, hasPermission } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/xase/v1/alerts
 * Lista alertas do tenant
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request)
    let tenantId: string | null = null
    if (auth.valid) {
      tenantId = auth.tenantId!
    } else {
      tenantId = await getTenantId()
      if (!tenantId) {
        return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 })
      }
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') // OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED
    const severity = searchParams.get('severity') // INFO, WARNING, ERROR, CRITICAL
    const alertType = searchParams.get('alert_type')
    const limit = parseInt(searchParams.get('limit') || '50')

    const whereClause: any = { tenantId: tenantId! }
    if (status) whereClause.status = status
    if (severity) whereClause.severity = severity
    if (alertType) whereClause.alertType = alertType

    const alerts = await prisma.alert.findMany({
      where: whereClause,
      orderBy: { triggeredAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      alerts: alerts.map((a) => ({
        id: a.id,
        alert_type: a.alertType,
        severity: a.severity,
        status: a.status,
        title: a.title,
        message: a.message,
        resource_type: a.resourceType,
        resource_id: a.resourceId,
        metric_name: a.metricName,
        metric_value: a.metricValue,
        threshold_value: a.thresholdValue,
        details: a.details ? JSON.parse(a.details) : null,
        recommendations: a.recommendations ? JSON.parse(a.recommendations) : null,
        triggered_at: a.triggeredAt,
        acknowledged_at: a.acknowledgedAt,
        resolved_at: a.resolvedAt,
      })),
    })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown')
    console.error('[Alerts API] GET Error:', message)
    return NextResponse.json({ error: 'ALERTS_ERROR', message }, { status: 500 })
  }
}

/**
 * POST /api/xase/v1/alerts
 * Cria um novo alerta
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (!hasPermission(auth, 'ingest')) {
      return NextResponse.json(
        { error: 'API key does not have ingest permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validações
    if (!body.alert_type || !body.severity || !body.title || !body.message) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'alert_type, severity, title, and message are required',
        },
        { status: 400 }
      )
    }

    // Criar alerta
    const alert = await prisma.alert.create({
      data: {
        tenantId: auth.tenantId!,
        alertType: body.alert_type,
        severity: body.severity,
        status: body.status || 'OPEN',
        title: body.title,
        message: body.message,
        resourceType: body.resource_type,
        resourceId: body.resource_id,
        metricName: body.metric_name,
        metricValue: body.metric_value,
        thresholdValue: body.threshold_value,
        details: body.details ? JSON.stringify(body.details) : null,
        recommendations: body.recommendations ? JSON.stringify(body.recommendations) : null,
      },
    })

    return NextResponse.json(
      {
        message: 'Alert created successfully',
        alert: {
          id: alert.id,
          alert_type: alert.alertType,
          severity: alert.severity,
          status: alert.status,
          triggered_at: alert.triggeredAt,
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown')
    console.error('[Alerts API] POST Error:', message)
    return NextResponse.json({ error: 'ALERT_CREATE_ERROR', message }, { status: 500 })
  }
}
