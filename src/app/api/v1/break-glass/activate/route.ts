/**
 * BREAK-GLASS ACTIVATION ENDPOINT
 */

import { NextRequest, NextResponse } from 'next/server'
import { BreakGlassManager } from '@/lib/xase/break-glass'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      userId,
      tenantId,
      resourceType,
      resourceId,
      reason,
      severity = 'HIGH',
      incidentId,
    } = body

    if (!userId || !tenantId || !resourceType || !resourceId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    const session = await BreakGlassManager.activate({
      userId,
      tenantId,
      resourceType,
      resourceId,
      reason,
      severity,
      incidentId,
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      session,
      warning: 'Break-glass access activated. All actions will be audited.',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Break-glass activation failed', details: error.message },
      { status: 500 }
    )
  }
}
