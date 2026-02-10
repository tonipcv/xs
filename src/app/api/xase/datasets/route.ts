// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantId } from '@/lib/xase/server-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })
    }

    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: {
        datasetId: true,
        name: true,
        consentStatus: true,
      },
      orderBy: { name: 'asc' },
      take: 200,
    })

    return NextResponse.json({ datasets })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
