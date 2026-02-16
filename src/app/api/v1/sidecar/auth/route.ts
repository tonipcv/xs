import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { z } from 'zod'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

const BodySchema = z.object({
  leaseId: z.string().min(1),
  attestationReport: z.string().optional(),
  binaryHash: z.string().optional(),
})

function generateStsToken(params: {
  leaseId: string
  tenantId: string
  ttl: number
  permissions: string[]
  sessionId: string
}): string {
  // Generate properly signed JWT token
  const payload = {
    leaseId: params.leaseId,
    tenantId: params.tenantId,
    sessionId: params.sessionId,
    permissions: params.permissions,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + params.ttl,
  }
  
  // Use JWT with HMAC-SHA256 signing
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret-change-in-production'
  const token = jwt.sign(payload, secret, { algorithm: 'HS256' })
  return token
}

export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId || !auth.apiKeyId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Read body once and parse
    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { leaseId, attestationReport, binaryHash } = parsed.data

    // Validate lease
    const now = new Date()
    const lease = await prisma.voiceAccessLease.findFirst({
      where: {
        leaseId,
        clientTenantId: auth.tenantId as string,
        status: 'ACTIVE',
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        datasetId: true,
        expiresAt: true,
        policy: {
          select: {
            canStream: true,
          },
        },
      },
    })

    if (!lease) {
      return NextResponse.json({ error: 'Lease invalid or expired' }, { status: 403 })
    }

    if (!lease.policy.canStream) {
      return NextResponse.json({ error: 'Streaming not allowed by policy' }, { status: 403 })
    }

    // Determine trust level
    const trustLevel = attestationReport ? 'ATTESTED' : 'SELF_REPORTED'
    const attested = !!attestationReport

    // Create SidecarSession first to get sessionId
    const sessionId = `sidecar_${crypto.randomBytes(16).toString('hex')}`
    const session = await prisma.sidecarSession.create({
      data: {
        id: sessionId,
        leaseId: lease.id,
        clientTenantId: auth.tenantId as string,
        datasetId: lease.datasetId,
        status: 'active',
        attestationReport: attestationReport || undefined,
        binaryHash: binaryHash || undefined,
        trustLevel,
        attested,
      },
    })

    // Generate ephemeral STS token (1 hour) with proper JWT signing
    const stsToken = generateStsToken({
      leaseId,
      tenantId: auth.tenantId as string,
      sessionId: session.id,
      ttl: 3600,
      permissions: ['s3:GetObject'],
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId as string,
        action: 'SIDECAR_SESSION_CREATED',
        resourceType: 'SIDECAR_SESSION',
        resourceId: sessionId,
        metadata: JSON.stringify({ leaseId }),
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({
      stsToken,
      sessionId: session.id,
      expiresAt: lease.expiresAt.toISOString(),
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] POST /api/v1/sidecar/auth error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
