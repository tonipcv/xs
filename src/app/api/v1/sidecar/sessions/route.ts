import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'
import { withTenantContext } from '@/lib/db/rls'

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    // Use RLS for tenant isolation
    const sessions = await withTenantContext(auth.tenantId!, async () => {
      return prisma.sidecarSession.findMany({
        where: {
          clientTenantId: auth.tenantId!,
          ...(status && { status }),
          deletedAt: null, // Soft delete filter
        },
        orderBy: { startedAt: 'desc' },
        take: Math.min(limit, 100),
        select: {
          id: true,
          leaseId: true,
          status: true,
          startedAt: true,
          lastHeartbeat: true,
          endedAt: true,
          totalBytesServed: true,
          totalSegmentsServed: true,
          trustLevel: true,
          attested: true,
        },
      })
    })

    return NextResponse.json({
      sessions: sessions.map(s => ({
        ...s,
        totalBytesServed: s.totalBytesServed.toString(),
      })),
      count: sessions.length,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] GET /api/v1/sidecar/sessions error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
