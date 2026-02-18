import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { validateBearer } from '@/lib/xase/bearer'
import { validateApiKey } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    // Auth: Bearer -> API Key -> Session
    let tenantId: string | null = null
    let authMode: 'bearer' | 'apikey' | 'session' | 'none' = 'none'
    const bearer = await validateBearer(req)
    if (bearer.valid) {
      tenantId = bearer.tenantId || null
      authMode = 'bearer'
    } else {
      const api = await validateApiKey(req)
      if (api.valid) {
        tenantId = api.tenantId || null
        authMode = 'apikey'
      } else {
        const session = await getServerSession(authOptions)
        if (!session?.user?.email) {
          const isDev = process.env.NODE_ENV !== 'production';
          return NextResponse.json(
            { error: 'Unauthorized', ...(isDev ? { details: { authMode, hasAuthHeader: !!req.headers.get('authorization') || !!req.headers.get('Authorization') } } : {}) },
            { status: 401 }
          )
        }
        const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { tenantId: true } })
        tenantId = user?.tenantId || null
        authMode = 'session'
      }
    }

    // Basic usage summary (best-effort)
    const now = new Date()
    const [offers, leases] = await Promise.all([
      prisma.accessOffer.count({}),
      prisma.accessLease.count({ where: { expiresAt: { gt: now }, revokedAt: null, deletedAt: null } }),
    ])

    return NextResponse.json({
      ok: true,
      tenantId,
      summary: {
        offers,
        activeLeases: leases,
        timestamp: now.toISOString(),
      },
      ...(process.env.NODE_ENV !== 'production' ? { debug: { authMode } } : {})
    })
  } catch (e: any) {
    console.error('[API][usage] error', e?.message || e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
