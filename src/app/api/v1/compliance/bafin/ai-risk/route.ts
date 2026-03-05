import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { BaFinCompliance } from '@/lib/compliance/bafin'
import { z } from 'zod'

const AIRiskSchema = z.object({
  modelId: z.string().min(1),
  usageContext: z.string().min(1),
  affectsFinancialDecisions: z.boolean(),
  affectsCreditworthiness: z.boolean(),
  hasHumanOversight: z.boolean(),
  dataQuality: z.enum(['poor', 'fair', 'good', 'excellent']),
})

/**
 * BaFin AI Risk Classification
 * POST /api/v1/compliance/bafin/ai-risk
 * 
 * EU AI Act risk-based approach
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || '';
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = AIRiskSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const classification = await BaFinCompliance.classifyAIRisk({
      ...parsed.data,
      tenantId: auth.tenantId,
    })

    return NextResponse.json({
      success: true,
      classification,
    })
  } catch (error: any) {
    console.error('[API] BaFin AI Risk error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
