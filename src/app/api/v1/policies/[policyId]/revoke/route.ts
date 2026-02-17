import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { z } from 'zod'

export async function POST(req: NextRequest, { params }: { params: Promise<{ policyId: string }> }) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const BodySchema = z.object({
      reason: z.string().min(1).optional(),
    })
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { reason } = parsed.data as { reason?: string }
    const { policyId } = await params

    const policy = await prisma.voiceAccessPolicy.findFirst({
      where: { policyId },
      include: { dataset: { select: { tenantId: true } } },
    })
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })

    // Apenas o dono do dataset (SUPPLIER) pode revogar
    if (policy.dataset.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (policy.status === 'REVOKED') {
      return NextResponse.json({ status: 'REVOKED', revokedAt: policy.revokedAt })
    }

    const updated = await prisma.voiceAccessPolicy.update({
      where: { id: policy.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: reason || 'revoked_by_supplier',
      },
      select: { status: true, revokedAt: true, revokedReason: true },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        action: 'POLICY_REVOKED',
        resourceType: 'POLICY',
        resourceId: policyId,
        metadata: JSON.stringify({ reason: updated.revokedReason }),
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (err: any) {
    console.error('[API] POST /api/v1/policies/:policyId/revoke error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
