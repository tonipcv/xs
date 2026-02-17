import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { compare } from 'bcryptjs'
import { sendEmail } from '@/lib/email'
import { generateEmailOtpCode } from '@/lib/otp'
import { logger, ensureRequestId } from '@/lib/observability/logger'

export async function POST(req: Request) {
  try {
    const requestId = ensureRequestId((req as any)?.headers?.get?.('x-request-id') || null)
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        twoFactorEnabled: true,
      }
    })

    if (!user || !user.password) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 400 })
    }

    const ok = await compare(password, user.password)
    if (!ok) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 400 })
    }

    // Se TOTP estiver habilitado, não envia OTP por email; apenas informa próximo passo
    if (user.twoFactorEnabled) {
      return NextResponse.json({ next: 'totp' }, { status: 200 })
    }

    // Fluxo OTP por email
    const code = generateEmailOtpCode()
    const expires = new Date(Date.now() + 10 * 60 * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data: { emailOtpCode: code, emailOtpExpires: expires }
    })

    try {
      await sendEmail({
        to: user.email!,
        subject: 'Seu código de login',
        html: `
          <p>Seu código de login é:</p>
          <p style="font-size: 24px; font-weight: bold;">${code}</p>
          <p>Este código expira em 10 minutos.</p>
        `
      })
    } catch (e) {
      // Não falha a etapa; o usuário pode solicitar novamente
    }

    return NextResponse.json({ next: 'otp' }, { status: 200 })
  } catch (e) {
    const requestId = ensureRequestId(null)
    logger.error('auth.request_otp:error', { requestId }, e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  } finally {
    // Do not disconnect Prisma in request scope; Next.js hot-reload/dev will manage connections
  }
}
