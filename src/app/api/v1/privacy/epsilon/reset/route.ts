import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { EpsilonBudgetTracker } from '@/lib/xase/epsilon-budget-tracker'
import { z } from 'zod'

const ResetBudgetSchema = z.object({
  datasetId: z.string().min(1),
})

/**
 * Reset Epsilon Budget
 * POST /api/v1/privacy/epsilon/reset
 * 
 * Resets epsilon budget for a dataset (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = ResetBudgetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { datasetId } = parsed.data
    const tracker = new EpsilonBudgetTracker()

    await tracker.resetBudget(auth.tenantId, datasetId)

    return NextResponse.json({
      success: true,
      message: `Epsilon budget reset for dataset ${datasetId}`,
    })
  } catch (error: any) {
    console.error('[API] Epsilon budget reset error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
