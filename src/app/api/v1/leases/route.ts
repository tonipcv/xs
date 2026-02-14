// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { validateBearer } from '@/lib/xase/bearer'
import { z } from 'zod'
import crypto from 'crypto'

const BodySchema = z.object({
  datasetId: z.string().min(1),
  ttlSeconds: z.coerce.number().int().min(60).max(60 * 60), // 1 min - 1 hour
})

function genLeaseId() {
  return 'lease_' + crypto.randomBytes(12).toString('hex')
}

export async function GET(req: NextRequest) {
  try {
    // Allow Bearer (CLI), then API Key (with RL)
    const bearer = await validateBearer(req)
    let tenantId: string | null = null
    let useApiKeyId: string | null = null
    if (bearer.valid) {
      tenantId = bearer.tenantId || null
    } else {
      const auth = await validateApiKey(req)
      if (!auth.valid || !auth.tenantId) {
        return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
      }
      tenantId = auth.tenantId as string
      if (auth.apiKeyId) {
        const rl = await checkApiRateLimit(auth.apiKeyId, 600, 60)
        if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
        useApiKeyId = auth.apiKeyId
      }
    }

    const url = new URL(req.url)
    const status = url.searchParams.get('status') as 'ACTIVE' | 'EXPIRED' | 'REVOKED' | null
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)

    const where: any = { clientTenantId: tenantId as string }
    if (status) where.status = status

    const leases = await prisma.voiceAccessLease.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: limit,
      select: {
        leaseId: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        revokedAt: true,
        policy: { select: { policyId: true, dataset: { select: { datasetId: true, name: true } } } },
      },
    })

    return NextResponse.json({ leases })
  } catch (err: any) {
    const msg = err?.message || String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // Accept Bearer (CLI). If not present, accept API Key (with rate limiting). Keep dev session fallback.
    let tenantId: string | null = null
    let apiKeyId: string | null = null
    const bearer = await validateBearer(req)
    if (bearer.valid) {
      tenantId = bearer.tenantId || null
    } else {
      let auth = await validateApiKey(req)
      // Development-only: allow UI session fallback without X-API-Key
      if ((!auth.valid || !auth.tenantId) && process.env.NODE_ENV !== 'production') {
        const session = await getServerSession(authOptions as any)
        const userEmail = (session as any)?.user?.email
        if (userEmail) {
          const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { tenantId: true } })
          if (user?.tenantId) {
            auth = { valid: true, tenantId: user.tenantId, apiKeyId: 'session-dev', error: null }
          }
        }
      }
      if (!auth.valid || !auth.tenantId) {
        return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
      }
      tenantId = auth.tenantId as string
      if (auth.apiKeyId) {
        const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
        if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
        apiKeyId = auth.apiKeyId
      }
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { datasetId, ttlSeconds } = parsed.data

    // Resolve dataset
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId },
      select: { id: true, status: true },
    })
    if (!dataset) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    if (dataset.status !== 'ACTIVE') return NextResponse.json({ error: 'Dataset not active' }, { status: 400 })

    // Find active policy for this client & dataset
    const now = new Date()
    const policy = await prisma.voiceAccessPolicy.findFirst({
      where: {
        datasetId: dataset.id,
        clientTenantId: tenantId as string,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      select: { id: true, canStream: true },
    })
    if (!policy) return NextResponse.json({ error: 'No active policy' }, { status: 403 })
    if (!policy.canStream) return NextResponse.json({ error: 'Streaming not allowed by policy' }, { status: 403 })

    // Enforce concurrent lease limit if configured
    const maxConc = (policy as any).maxConcurrentLeases as number | null | undefined
    if (maxConc && maxConc > 0) {
      const activeLeases = await prisma.voiceAccessLease.count({
        where: {
          policyId: policy.id,
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
      })
      if (activeLeases >= maxConc) {
        return NextResponse.json(
          { error: 'Concurrent lease limit reached' },
          { status: 429 }
        )
      }
    }

    const leaseId = genLeaseId()
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

    // Create lease (typed Prisma)
    const created = await prisma.voiceAccessLease.create({
      data: {
        leaseId,
        datasetId: dataset.id,
        clientTenantId: tenantId as string,
        policyId: policy.id,
        status: 'ACTIVE',
        expiresAt,
      },
      select: { leaseId: true, expiresAt: true, status: true },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: tenantId as string,
        action: 'LEASE_MINTED',
        resourceType: 'LEASE',
        resourceId: leaseId,
        metadata: JSON.stringify({ datasetId, ttlSeconds }),
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({ leaseId: created.leaseId, status: created.status, expiresAt: created.expiresAt })
  } catch (err: any) {
    const msg = err?.message || String(err)
    const status = err?.statusCode || 500
    console.error('[API] POST /api/v1/leases error:', msg)
    return NextResponse.json({ error: status === 500 ? 'Internal error' : msg }, { status })
  }
}
