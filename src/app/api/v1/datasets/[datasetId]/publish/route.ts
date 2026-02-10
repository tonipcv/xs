// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { publishDataset } from '@/lib/xase/dataset-lifecycle'

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { datasetId } = await params

    // 🔥 USAR LIFECYCLE ENFORCEMENT
    const result = await publishDataset(datasetId, auth.tenantId)

    if (!result.allowed) {
      return NextResponse.json({ 
        error: 'Cannot publish dataset', 
        reason: result.reason,
        currentState: result.currentState,
      }, { status: 400 })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        action: 'DATASET_PUBLISHED',
        resourceType: 'DATASET',
        resourceId: datasetId,
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: result.reason,
      status: result.currentState.status,
      processingStatus: result.currentState.processingStatus,
    })
  } catch (err: any) {
    console.error('[API] publish dataset error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
