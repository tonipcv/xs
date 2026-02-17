import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { GDPRCompliance } from '@/lib/compliance/gdpr'
import { z } from 'zod'

const PortabilityRequestSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  format: z.enum(['json', 'csv', 'xml']).default('json'),
  requestedBy: z.string().min(1),
})

/**
 * GDPR Data Portability
 * POST /api/v1/compliance/gdpr/portability
 * 
 * Article 20 GDPR - Right to data portability
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = PortabilityRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { userId, email, format, requestedBy } = parsed.data

    if (!userId && !email) {
      return NextResponse.json(
        { error: 'Either userId or email must be provided' },
        { status: 400 }
      )
    }

    const result = await GDPRCompliance.processPortability({
      userId,
      email,
      tenantId: auth.tenantId,
      format,
      requestedBy,
    })

    const contentType = format === 'json' ? 'application/json'
      : format === 'csv' ? 'text/csv'
      : 'application/xml'

    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="data-export.${format}"`,
      },
    })
  } catch (error: any) {
    console.error('[API] GDPR Portability error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
