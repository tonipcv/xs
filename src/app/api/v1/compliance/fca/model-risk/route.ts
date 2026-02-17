import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { FCACompliance } from '@/lib/compliance/fca'
import { z } from 'zod'

const ModelRiskSchema = z.object({
  modelId: z.string().min(1),
  modelType: z.string().min(1),
  usageContext: z.string().min(1),
  dataQuality: z.enum(['poor', 'fair', 'good', 'excellent']),
  validationCoverage: z.number().min(0).max(100),
  assessor: z.string().min(1),
})

/**
 * FCA Model Risk Assessment
 * POST /api/v1/compliance/fca/model-risk
 * 
 * SR 11-7 Model Risk Management
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = ModelRiskSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const assessment = await FCACompliance.assessModelRisk(parsed.data)

    return NextResponse.json({
      success: true,
      assessment,
    })
  } catch (error: any) {
    console.error('[API] FCA Model Risk error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
