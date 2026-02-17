import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { GDPRCompliance } from '@/lib/compliance/gdpr'
import { z } from 'zod'

const ErasureRequestSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  reason: z.string().min(1),
  requestedBy: z.string().min(1),
})

/**
 * GDPR Right to Erasure (Right to be Forgotten)
 * POST /api/v1/compliance/gdpr/erasure
 * 
 * Article 17 GDPR - Right to erasure
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = ErasureRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { userId, email, reason, requestedBy } = parsed.data

    if (!userId && !email) {
      return NextResponse.json(
        { error: 'Either userId or email must be provided' },
        { status: 400 }
      )
    }

    const result = await GDPRCompliance.processErasure({
      userId,
      email,
      tenantId: auth.tenantId,
      reason,
      requestedBy,
    })

    return NextResponse.json({
      success: result.success,
      deletedRecords: result.deletedRecords,
      message: `Successfully deleted ${result.deletedRecords} records`,
    })
  } catch (error: any) {
    console.error('[API] GDPR Erasure error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
