import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, email, password, organizationName } = body as {
      name?: string
      email?: string
      password?: string
      organizationName?: string
    }

    if (!name || !email || !password || !organizationName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create tenant (organization)
    const tenant = await prisma.tenant.create({
      data: {
        name: organizationName,
        email,
        organizationType: 'CLIENT',
      },
    })

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        tenantId: tenant.id,
        xaseRole: 'OWNER',
        emailVerified: new Date(),
      },
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: 'USER_REGISTERED',
        resourceType: 'USER',
        resourceId: user.id,
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'AI Lab registered successfully',
      organizationType: 'CLIENT',
      tenantId: tenant.id,
      userId: user.id,
    })
  } catch (error: any) {
    console.error('[API] POST /api/register/ai-lab error:', error)
    return NextResponse.json({ error: error?.message || 'Registration failed' }, { status: 500 })
  }
}
