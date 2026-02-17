import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { GDPRCompliance } from '@/lib/compliance/gdpr'
import { z } from 'zod'

const DSARRequestSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  requestedBy: z.string().min(1),
})

/**
 * GDPR Data Subject Access Request (DSAR)
 * POST /api/v1/compliance/gdpr/dsar
 * 
 * Article 15 GDPR - Right of access by the data subject
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = DSARRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { userId, email, requestedBy } = parsed.data

    if (!userId && !email) {
      return NextResponse.json(
        { error: 'Either userId or email must be provided' },
        { status: 400 }
      )
    }

    const response = await GDPRCompliance.processDSAR({
      userId,
      email,
      tenantId: auth.tenantId,
      requestedBy,
      requestDate: new Date(),
    })

    return NextResponse.json({
      success: true,
      dsar: response,
    })
  } catch (error: any) {
    console.error('[API] GDPR DSAR error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
