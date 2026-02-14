// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.XASE_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // Find ACTIVE leases that are expired
    const expired = await prisma.voiceAccessLease.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      select: { id: true, leaseId: true, clientTenantId: true },
      take: 1000,
    })

    if (expired.length === 0) {
      return NextResponse.json({ updated: 0 })
    }

    const ids = expired.map(l => l.id)

    await prisma.$transaction(async (tx) => {
      await tx.voiceAccessLease.updateMany({
        where: { id: { in: ids } },
        data: { status: 'EXPIRED', revokedAt: now, revokedReason: 'ttl_expired' },
      })

      // Audit per lease (best effort)
      for (const l of expired) {
        await tx.auditLog.create({
          data: {
            tenantId: l.clientTenantId,
            action: 'LEASE_EXPIRED',
            resourceType: 'LEASE',
            resourceId: l.leaseId,
            metadata: JSON.stringify({ reason: 'ttl_expired' }),
            status: 'SUCCESS',
          },
        }).catch(() => {})
      }
    })

    return NextResponse.json({ updated: expired.length })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[CRON] expire leases error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
