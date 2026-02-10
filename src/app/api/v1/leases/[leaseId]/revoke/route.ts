// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { z } from 'zod'

const BodySchema = z.object({ reason: z.string().min(1).optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ leaseId: string }> }) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId || !auth.apiKeyId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
    if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

    const { leaseId } = await params
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const reason = parsed.data.reason || 'revoked_by_supplier'

    // Load lease with dataset owner
    const lease = await prisma.voiceAccessLease.findFirst({
      where: { leaseId },
      select: {
        id: true,
        status: true,
        policy: { select: { id: true, dataset: { select: { tenantId: true } } } },
      },
    })
    if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

    // Only dataset owner (supplier) can revoke
    if (lease.policy.dataset.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (lease.status === 'REVOKED') {
      return NextResponse.json({ status: 'REVOKED' })
    }

    const updated = await prisma.voiceAccessLease.update({
      where: { id: lease.id },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason },
      select: { status: true, revokedAt: true, revokedReason: true },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId as string,
        action: 'LEASE_REVOKED',
        resourceType: 'LEASE',
        resourceId: leaseId,
        metadata: JSON.stringify({ reason: updated.revokedReason }),
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] POST /api/v1/leases/:leaseId/revoke error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
