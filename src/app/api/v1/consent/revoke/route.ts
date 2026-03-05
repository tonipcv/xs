import { NextRequest, NextResponse } from 'next/server'
import { ConsentManager } from '@/lib/xase/consent-manager'
import { validateApiKey } from '@/lib/xase/auth'
import { z } from 'zod'

const BodySchema = z.object({
  datasetId: z.string().min(1),
  userId: z.string().optional(),
  reason: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { datasetId, userId, reason } = parsed.data

    await ConsentManager.revokeConsent({
      datasetId,
      tenantId: auth.tenantId as string,
      userId,
      reason,
      revokedBy: auth.tenantId as string,
    })

    return NextResponse.json({
      success: true,
      datasetId,
      propagatedAt: new Date().toISOString(),
      message: 'Consent revoked and propagated to all enforcement points',
    })
  } catch (error: any) {
    console.error('[API] POST /api/v1/consent/revoke error:', error)
    return NextResponse.json(
      { error: 'Internal error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
