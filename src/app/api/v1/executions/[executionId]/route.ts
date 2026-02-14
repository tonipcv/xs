import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  context: any
) {
  try {
    const { params } = context as { params: { executionId: string } }
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

    const { executionId } = params

    const execution = await prisma.policyExecution.findUnique({
      where: { executionId },
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
            evidenceFormat: true,
            complianceLevel: true,
          },
        },
        policy: {
          select: {
            policyId: true,
            usagePurpose: true,
            maxHours: true,
            hoursConsumed: true,
          },
        },
        lease: {
          select: {
            leaseId: true,
            status: true,
            issuedAt: true,
            expiresAt: true,
          },
        },
        review: true,
      },
    })

    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      )
    }

    if (execution.buyerTenantId !== user.tenant.id) {
      return NextResponse.json(
        { error: 'You do not own this execution' },
        { status: 403 }
      )
    }

    // Calculate usage metrics
    const usageMetrics = {
      hoursUsed: execution.hoursUsed,
      requestCount: execution.requestCount,
      bytesStreamed: execution.bytesStreamed.toString(),
      totalCost: execution.totalCost,
      currency: execution.currency,
      utilizationPercent:
        execution.policy.maxHours && execution.policy.maxHours > 0
          ? (execution.hoursUsed / execution.policy.maxHours) * 100
          : 0,
    }

    return NextResponse.json({
      ...execution,
      usageMetrics,
    })
  } catch (error: any) {
    console.error('Get execution error:', error)
    return NextResponse.json(
      { error: 'Failed to get execution' },
      { status: 500 }
    )
  }
}
