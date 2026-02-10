import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
// local robust tenant resolver

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const email = session.user?.email as string | undefined
    if (!email) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }
    // Ensure user exists (do not reference tenantId column to be compatible with DBs missing it)
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: (session.user as any)?.name || null },
      select: { id: true, name: true },
    })

    // Resolve tenant solely by email for compatibility
    let tenantId: string | null = null
    const existing = await prisma.tenant.findFirst({ where: { email }, select: { id: true } })
    if (existing?.id) {
      tenantId = existing.id
    } else {
      const created = await prisma.tenant.create({
        data: {
          email,
          name: (session.user as any)?.name || email.split('@')[0],
          companyName: null,
          status: 'ACTIVE',
          plan: 'enterprise',
        },
        select: { id: true },
      })
      tenantId = created.id
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'TENANT_RESOLVE_FAILED' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'default'
    const permissions = typeof body?.permissions === 'string' && body.permissions.trim() ? body.permissions.trim() : 'ingest,verify,export'
    const rateLimit = Number.isFinite(body?.rateLimit) ? Math.max(1, Math.floor(body.rateLimit)) : 1000

    const apiKeyValue = `xase_pk_${crypto.randomBytes(24).toString('hex')}`
    const keyHash = await bcrypt.hash(apiKeyValue, 10)
    const keyPrefix = apiKeyValue.substring(0, 12)

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId,
        name,
        keyHash,
        keyPrefix,
        permissions,
        isActive: true,
        rateLimit,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        isActive: true,
        rateLimit: true,
        createdAt: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'KEY_CREATED',
        resourceType: 'API_KEY',
        resourceId: apiKey.id,
        metadata: JSON.stringify({ name, permissions }),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({ key: apiKeyValue, ...apiKey }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try { console.error('[UI Create API Key] Error:', message) } catch {}
    return NextResponse.json({ error: message || 'INTERNAL_ERROR' }, { status: 500 })
  }
}
