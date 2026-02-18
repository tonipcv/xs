import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { ConsentManager } from '@/lib/xase/consent-manager'
import { validateConsentPayload } from '@/lib/compliance/lgpd-health'

export async function GET(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }
    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 600, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const url = new URL(req.url)
    const datasetId = url.searchParams.get('datasetId') || ''
    if (!datasetId) return NextResponse.json({ error: 'datasetId is required' }, { status: 400 })

    const status = await ConsentManager.checkConsent(datasetId)
    return NextResponse.json({ datasetId, status })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }
    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    try { validateConsentPayload(body) } catch (e: any) { return NextResponse.json({ error: e?.message || 'Invalid payload' }, { status: 400 }) }

    const status = body.legalBasis === 'EXPLICIT_CONSENT' ? 'VERIFIED_BY_XASE' : 'SELF_DECLARED'

    await ConsentManager.grantConsent({
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
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }
    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const datasetId = body?.datasetId || ''
    const reason = body?.reason || 'LGPD: consent revoked'
    if (!datasetId) return NextResponse.json({ error: 'datasetId is required' }, { status: 400 })

    await ConsentManager.revokeConsent({
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
