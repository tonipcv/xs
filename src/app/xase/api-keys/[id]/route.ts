import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, { params }: any) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const email = session.user.email

    // Resolve tenant by email, aligning to create route approach
    const tenant = await prisma.tenant.findFirst({ where: { email }, select: { id: true } })
    if (!tenant?.id) {
      return NextResponse.json({ error: 'TENANT_NOT_FOUND' }, { status: 403 })
    }

    const keyId = params.id

    const existingKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        tenantId: tenant.id,
      },
    })

    if (!existingKey) {
      return NextResponse.json({ error: 'API key not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Soft delete (deactivate)
    await prisma.apiKey.update({ where: { id: keyId }, data: { isActive: false } })

    // Audit log (best-effort)
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'KEY_DELETED',
        resourceType: 'API_KEY',
        resourceId: keyId,
        metadata: JSON.stringify({ name: existingKey.name }),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = (error as any)?.message || String(error)
    try { console.error('[UI Delete API Key] Error:', message) } catch {}
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
