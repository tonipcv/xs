import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    })

    if (!user?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = {
      buyerTenantId: user.tenant.id,
    }

    if (status) where.status = status

    const [executions, total] = await Promise.all([
      prisma.policyExecution.findMany({
        where,
        include: {
          offer: {
            select: {
              offerId: true,
              title: true,
              description: true,
              pricePerHour: true,
              currency: true,
              riskClass: true,
              jurisdiction: true,
            },
          },
          policy: {
            select: {
              policyId: true,
              usagePurpose: true,
            },
          },
          lease: {
            select: {
              leaseId: true,
              status: true,
              expiresAt: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.policyExecution.count({ where }),
    ])

    return NextResponse.json({
      executions,
      total,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('List executions error:', error)
    return NextResponse.json(
      { error: 'Failed to list executions' },
      { status: 500 }
    )
  }
}
