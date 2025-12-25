import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth.config'
import { prisma } from '@/lib/prisma'
import { authenticator } from 'otplib'

export async function POST() {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } })
    if (!user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const secret = authenticator.generateSecret()
    // Salva o secret (habilita somente após verify)
    await prisma.user.update({ where: { id: session.user.id }, data: { totpSecret: secret } })

    const issuer = process.env.NEXT_PUBLIC_APP_NAME || 'Xase'
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret)

    return NextResponse.json({ otpauthUrl })
  } catch (e) {
    console.error('2FA setup error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
