import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth.config'
import { prisma } from '@/lib/prisma'
import { verifyTotp } from '@/lib/otp'

export async function POST(request: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null as any)
    const token = body?.token as string | undefined
    if (!token) {
      return NextResponse.json({ error: 'Token é obrigatório' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { totpSecret: true }
    })
    if (!user?.totpSecret) {
      return NextResponse.json({ error: '2FA não iniciado' }, { status: 400 })
    }

    const ok = verifyTotp(token, user.totpSecret)
    if (!ok) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { twoFactorEnabled: true, twoFactorVerifiedAt: new Date() }
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('2FA verify error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
