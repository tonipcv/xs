import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issueCliToken } from '@/lib/xase/bearer'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body?.email || '').toString().trim().toLowerCase()
    const code = (body?.code || '').toString().trim()
    const scopes: string[] = Array.isArray(body?.scopes) ? body.scopes : ['read:offers']

    if (!email || !code) return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailOtpCode: true, emailOtpExpires: true, tenantId: true }
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (!user.emailOtpCode || !user.emailOtpExpires) {
      return NextResponse.json({ error: 'No OTP requested' }, { status: 400 })
    }

    if (user.emailOtpCode !== code) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }

    if (user.emailOtpExpires.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Code expired' }, { status: 400 })
    }

    // Clear OTP after use
    await prisma.user.update({ where: { id: user.id }, data: { emailOtpCode: null, emailOtpExpires: null } })

    const tenantId = user.tenantId || 'PUBLIC_TENANT'
    const token = await issueCliToken(tenantId, scopes, 15 * 60)

    return NextResponse.json(token)
  } catch (e: any) {
    console.error('[CLI][verify-otp] error', e?.message || e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
