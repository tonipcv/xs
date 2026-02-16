import { NextResponse } from 'next/server'
import { manuallyExtendLease } from '@/lib/jobs/lease-auto-renew'

export async function POST(request: Request, context: { params: Promise<{ leaseId: string }> }) {
  try {
    const { leaseId } = await context.params
    if (!leaseId) {
      return NextResponse.json({ error: 'Missing leaseId' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const additionalSeconds = Number(body?.additionalSeconds)

    if (!additionalSeconds || !Number.isFinite(additionalSeconds) || additionalSeconds <= 0) {
      return NextResponse.json({ error: 'additionalSeconds must be a positive number' }, { status: 400 })
    }

    const result = await manuallyExtendLease(leaseId, additionalSeconds)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Unable to extend lease' }, { status: 400 })
    }

    return NextResponse.json({ success: true, leaseId, newExpiresAt: result.newExpiresAt?.toISOString() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
