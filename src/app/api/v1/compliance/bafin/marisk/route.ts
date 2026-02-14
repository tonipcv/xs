import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { BaFinCompliance } from '@/lib/compliance/bafin'
import { z } from 'zod'

const MaRiskSchema = z.object({
  systemId: z.string().min(1),
  hasChangeManagement: z.boolean(),
  hasAccessControl: z.boolean(),
  hasDataBackup: z.boolean(),
  hasIncidentResponse: z.boolean(),
  hasBusinessContinuity: z.boolean(),
  criticalityLevel: z.enum(['low', 'medium', 'high', 'very_high']),
})

/**
 * BaFin MaRisk Assessment
 * POST /api/v1/compliance/bafin/marisk
 * 
 * Minimum Requirements for Risk Management
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = MaRiskSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const assessment = await BaFinCompliance.assessMaRisk({
      ...parsed.data,
      tenantId: auth.tenantId,
    })

    return NextResponse.json({
      success: true,
      assessment,
    })
  } catch (error: any) {
    console.error('[API] BaFin MaRisk error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
