import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { publishDataset } from '@/lib/xase/dataset-lifecycle'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Rate limiting stubbed

    const { datasetId } = await params

    // 🔥 Publicação (stub)
    const result = await publishDataset(datasetId)

    // Audit log (best-effort)
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
      success: result.success,
      message: 'Dataset published successfully (stub)',
      publishedAt: result.publishedAt,
    })
  } catch (err: any) {
    console.error('[API] publish dataset error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
