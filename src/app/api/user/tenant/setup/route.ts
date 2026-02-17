import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, email, organizationType } = body as {
      name?: string
      email?: string
      organizationType?: 'SUPPLIER' | 'CLIENT'
    }

    if (!name || !organizationType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Ensure user exists
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // If already linked, return success
    if (user.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } })
      return NextResponse.json({ ok: true, tenantId: tenant?.id, organizationType: tenant?.organizationType })
    }

    // Create tenant and link user
    const tenant = await prisma.tenant.create({
      data: {
        name,
        email: email || session.user.email,
        organizationType,
        status: 'ACTIVE',
      } as any,
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { tenantId: tenant.id },
    })

    return NextResponse.json({ ok: true, tenantId: tenant.id, organizationType: tenant.organizationType })
  } catch (error: any) {
    console.error('[API] POST /api/user/tenant/setup error:', error)
    return NextResponse.json({ error: error?.message || 'Setup failed' }, { status: 500 })
  }
}
