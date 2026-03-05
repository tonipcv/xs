import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { ConsentManager } from '@/lib/xase/consent-manager'
import { validateConsentPayload } from '@/lib/compliance/lgpd-health'

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || '';
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const datasetId = url.searchParams.get('datasetId') || ''
    if (!datasetId) return NextResponse.json({ error: 'datasetId is required' }, { status: 400 })

    const status = await (ConsentManager as any).checkConsent(datasetId)
    return NextResponse.json({ datasetId, status })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || '';
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    try { validateConsentPayload(body) } catch (e: any) { 
      return NextResponse.json({ error: e?.message || 'Invalid payload' }, { status: 400 }) 
    }

    const status = body.legalBasis === 'EXPLICIT_CONSENT' ? 'VERIFIED_BY_XASE' : 'SELF_DECLARED'

    await (ConsentManager as any).grantConsent({
      datasetId: body.datasetId,
      tenantId: body.tenantId,
      status: status as any,
      version: body.version,
      proofUri: body.proofUri,
      proofHash: body.proofHash,
      grantedBy: auth.tenantId as string,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || '';
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const datasetId = body?.datasetId || ''
    const reason = body?.reason || 'LGPD: consent revoked'
    if (!datasetId) return NextResponse.json({ error: 'datasetId is required' }, { status: 400 })

    await (ConsentManager as any).revokeConsent({
      datasetId,
      tenantId: auth.tenantId as string,
      revokedBy: auth.tenantId as string,
      reason,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
