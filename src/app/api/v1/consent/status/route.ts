import { NextRequest, NextResponse } from 'next/server'
import { ConsentManager } from '@/lib/xase/consent-manager'
import { validateApiKey } from '@/lib/xase/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const datasetId = url.searchParams.get('datasetId')

    if (!datasetId) {
      return NextResponse.json({ error: 'Missing datasetId parameter' }, { status: 400 })
    }

    const status = await ConsentManager.checkConsent(datasetId)

    if (!status) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    return NextResponse.json({
      datasetId,
      status: status.status,
      version: status.version,
      hasProof: status.hasProof,
      lastUpdated: status.lastUpdated.toISOString(),
    })
  } catch (error: any) {
    console.error('[API] GET /api/v1/consent/status error:', error)
    return NextResponse.json(
      { error: 'Internal error', details: error.message },
      { status: 500 }
    )
  }
}
