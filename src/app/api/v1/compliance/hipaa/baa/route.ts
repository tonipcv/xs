import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }
    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 120, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const partner: string | undefined = body?.partner
    const effectiveAt = body?.effectiveAt ? new Date(body.effectiveAt) : new Date()
    const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null
    const agreementUri: string | null = body?.agreementUri ?? null
    const agreementHash: string | null = body?.agreementHash ?? null

    if (!partner || typeof partner !== 'string') {
      return NextResponse.json({ error: 'Missing partner' }, { status: 400 })
    }

    const rec = await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        action: 'HIPAA_BAA_SIGNED',
        resourceType: 'TENANT',
        resourceId: auth.tenantId,
        metadata: JSON.stringify({
          partner,
          effectiveAt: effectiveAt.toISOString(),
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          agreementUri,
          agreementHash,
        }),
      },
    })

    return NextResponse.json({ id: rec.id, status: 'RECORDED', tenantId: auth.tenantId, partner })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
