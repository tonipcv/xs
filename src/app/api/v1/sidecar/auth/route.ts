import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { z } from 'zod'
import crypto from 'crypto'

const BodySchema = z.object({
  leaseId: z.string().min(1),
})

function generateStsToken(params: {
  leaseId: string
  tenantId: string
  ttl: number
  permissions: string[]
}): string {
  // Generate ephemeral STS token (JWT-like structure)
  const payload = {
    leaseId: params.leaseId,
    tenantId: params.tenantId,
    permissions: params.permissions,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + params.ttl,
  }
  
  // Simple token (in production, use proper JWT signing)
  const token = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `sts_${token}`
}

export async function POST(req: NextRequest) {
  try {
    // Development-only bypass: skip API Key and DB checks
    if (process.env.NODE_ENV !== 'production' && process.env.SIDECAR_AUTH_BYPASS === '1') {
      const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
      const leaseId = parsed.success ? parsed.data.leaseId : `lease_dev_${Date.now()}`

      const tenantId = process.env.DEV_TENANT_ID || 'DEV_TENANT'
      const stsToken = generateStsToken({
        leaseId,
        tenantId,
        ttl: 3600,
        permissions: ['s3:GetObject'],
      })

      const sessionId = `sidecar_${crypto.randomBytes(16).toString('hex')}`
      const expiresAt = new Date(Date.now() + 3600 * 1000)

      return NextResponse.json({
        stsToken,
        sessionId,
        expiresAt: expiresAt.toISOString(),
      })
    }

    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId || !auth.apiKeyId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const rl = await checkApiRateLimit(auth.apiKeyId, 300, 60)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { leaseId } = parsed.data

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

    // Generate ephemeral STS token (1 hour)
    const stsToken = generateStsToken({
      leaseId,
      tenantId: auth.tenantId as string,
      ttl: 3600,
      permissions: ['s3:GetObject'],
    })

    // Parse optional attestation from request
    const body = await req.json().catch(() => ({}))
    const attestationReport = body.attestationReport
    const binaryHash = body.binaryHash
    
    // Determine trust level
    const trustLevel = attestationReport ? 'ATTESTED' : 'SELF_REPORTED'
    const attested = !!attestationReport

    // Create SidecarSession
    const sessionId = `sidecar_${crypto.randomBytes(16).toString('hex')}`
    const session = await prisma.sidecarSession.create({
      data: {
        id: sessionId,
        leaseId: lease.id,
        clientTenantId: auth.tenantId as string,
        datasetId: lease.datasetId,
        status: 'active',
        attestationReport,
        binaryHash,
        trustLevel,
        attested,
      },
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
