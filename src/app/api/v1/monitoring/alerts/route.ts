/**
 * Alerts API
 */

import { NextRequest, NextResponse } from 'next/server'
import { AlertManager } from '@/lib/notifications/alert-manager'
import { protectApiEndpoint } from '@/lib/security/api-protection'

export async function GET(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: true,
    requireTenant: true,
    endpoint: 'monitoring-alerts',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as any
    const severity = searchParams.get('severity') as any

    const alerts = await AlertManager.getActiveAlerts(
      protection.tenantId!,
      category,
      severity
    )

    const response = NextResponse.json({
      alerts,
      count: alerts.length,
    })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Alerts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: true,
    requireTenant: true,
    endpoint: 'monitoring-alerts',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const body = await request.json()
    const { category, severity, title, message, metadata } = body

    if (!category || !severity || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const alert = await AlertManager.createAlert(
      protection.tenantId!,
      category,
      severity,
      title,
      message,
      metadata
    )

    const response = NextResponse.json({ alert })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Create alert error:', error)
    return NextResponse.json(
      { error: 'Failed to create alert' },
      { status: 500 }
    )
  }
}
