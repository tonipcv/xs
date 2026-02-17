import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const type = url.searchParams.get('type') as 'CLIENT' | 'SUPPLIER' | null

    const where = type ? { organizationType: type } : {}

    const tenants = await prisma.tenant.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        organizationType: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ tenants })
  } catch (e: any) {
    console.error('List tenants error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
