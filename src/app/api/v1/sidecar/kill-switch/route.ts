import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'
import { z } from 'zod'

const BodySchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { sessionId, reason } = parsed.data

    // Get session
    const session = await prisma.sidecarSession.findUnique({
      where: { id: sessionId },
      include: {
        lease: true,
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Verify tenant owns this session
    if (session.clientTenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Kill session and revoke lease (conditional)
    const tx: any[] = [
      prisma.sidecarSession.update({
        where: { id: sessionId },
        data: {
          status: 'killed',
          endedAt: new Date(),
        },
      }),
    ]
    if (session.leaseId) {
      tx.push(
        prisma.voiceAccessLease.update({
          where: { id: session.leaseId },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
            revokedReason: reason,
          },
        })
      )
    }
    await prisma.$transaction(tx)

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId as string,
        action: 'SIDECAR_KILL_SWITCH',
        resourceType: 'SIDECAR_SESSION',
        resourceId: sessionId,
        metadata: JSON.stringify({ reason }),
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      sessionId,
      status: 'killed',
      reason,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] POST /api/v1/sidecar/kill-switch error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET endpoint for Sidecar to poll
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const sessionIdParam = url.searchParams.get('sessionId')
    const leaseIdParam = url.searchParams.get('leaseId')

    if (!sessionIdParam && !leaseIdParam) {
      return NextResponse.json({ error: 'sessionId or leaseId required' }, { status: 400 })
    }

    let session: { status: string } | null = null
    if (sessionIdParam) {
      session = await prisma.sidecarSession.findUnique({
        where: { id: sessionIdParam },
        select: { status: true },
      })
    } else if (leaseIdParam) {
      session = await prisma.sidecarSession.findFirst({
        where: { leaseId: leaseIdParam },
        select: { status: true },
      })
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({
      killed: session.status === 'killed',
      status: session.status,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] GET /api/v1/sidecar/kill-switch error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
