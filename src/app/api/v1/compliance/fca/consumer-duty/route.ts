import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { FCACompliance } from '@/lib/compliance/fca'
import { z } from 'zod'

const ConsumerDutySchema = z.object({
  datasetId: z.string().min(1),
  usagePurpose: z.string().min(1),
  pricingModel: z.string().optional(),
})

/**
 * FCA Consumer Duty Check
 * POST /api/v1/compliance/fca/consumer-duty
 * 
 * FCA Consumer Duty (July 2023)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = ConsumerDutySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const check = await FCACompliance.checkConsumerDuty({
      ...parsed.data,
      tenantId: auth.tenantId,
    })

    return NextResponse.json({
      success: true,
      check,
    })
  } catch (error: any) {
    console.error('[API] FCA Consumer Duty error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
