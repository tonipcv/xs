import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { generateEmailOtpCode } from '@/lib/otp'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body?.email || '').toString().trim().toLowerCase()
    const scopes: string[] = Array.isArray(body?.scopes) ? body.scopes : ['read:offers']
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const code = generateEmailOtpCode()
    const expires = new Date(Date.now() + 10 * 60 * 1000)

    await prisma.user.update({ where: { id: user.id }, data: { emailOtpCode: code, emailOtpExpires: expires } })

    // Best-effort email
    try {
      await sendEmail({
        to: user.email!,
        subject: 'Xase: your CLI login code',
        html: `<p>Your Xase CLI login code is:</p><p style="font-size:24px;font-weight:bold;">${code}</p><p>Expires in 10 minutes.</p>`
      })
    } catch {}

    // Return minimal info (do not leak scopes back)
    return NextResponse.json({ next: 'otp', expires_in: 600 })
  } catch (e: any) {
    console.error('[CLI][request-otp] error', e?.message || e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
