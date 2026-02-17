/**
 * JIT ACCESS REQUEST ENDPOINT
 */

import { NextRequest, NextResponse } from 'next/server'
import { JITAccessManager } from '@/lib/xase/jit-access'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      userId,
      tenantId,
      resourceType,
      resourceId,
      permissions,
      reason,
      duration = 3600,
      requiresApproval = false,
    } = body

    if (!userId || !tenantId || !resourceType || !resourceId || !permissions || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const grant = await JITAccessManager.requestAccess({
      userId,
      tenantId,
      resourceType,
      resourceId,
      permissions,
      reason,
      duration,
      requiresApproval,
    })

    return NextResponse.json({
      success: true,
      grant,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'JIT access request failed', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
