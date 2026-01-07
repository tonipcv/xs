import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/auth.config'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions as any)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true, xaseRole: true }
    })

    return NextResponse.json({ twoFactorEnabled: !!user?.twoFactorEnabled, role: user?.xaseRole || null })
  } catch (e) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
