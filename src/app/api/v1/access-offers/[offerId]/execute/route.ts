import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExecuteAccessOfferSchema } from '@/lib/validations/access-offer'
import { nanoid } from 'nanoid'

export async function POST(
  req: NextRequest,
  context: any
) {
  try {
    const { params } = context as { params: { offerId: string } }
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

    const { offerId } = params
    const body = await req.json()
    const validated = ExecuteAccessOfferSchema.parse(body)

    // Get the offer
    const offer = await prisma.accessOffer.findUnique({
      where: { offerId },
      include: { dataset: true },
    })

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (offer.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Offer is not active' },
        { status: 400 }
      )
    }

    // Create Policy (enforcement layer)
    const policy = await prisma.voiceAccessPolicy.create({
      data: {
        policyId: `policy_${nanoid(16)}`,
        datasetId: offer.datasetId,
        clientTenantId: user.tenant.id,
        usagePurpose: validated.usagePurpose,
        maxHours: validated.requestedHours || offer.scopeHours,
        allowedEnvironment: validated.environment,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        canStream: (offer.constraints as any).canStream ?? true,
        canBatchDownload: (offer.constraints as any).canBatchDownload ?? false,
        allowedColumns: [],
        deniedColumns: [],
        status: 'ACTIVE',
      },
    })

    // Create Lease (TTL-based access)
    const lease = await prisma.voiceAccessLease.create({
      data: {
        leaseId: `lease_${nanoid(16)}`,
        datasetId: offer.datasetId,
        clientTenantId: user.tenant.id,
        policyId: policy.id,
        status: 'ACTIVE',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    })

    // Create PolicyExecution (runtime governance + metering)
    const execution = await prisma.policyExecution.create({
      data: {
        executionId: `exec_${nanoid(16)}`,
        offerId: offer.id,
        buyerTenantId: user.tenant.id,
        policyId: policy.id,
        leaseId: lease.id,
        allowedPurposes: offer.allowedPurposes,
        constraints: offer.constraints as any,
        hoursUsed: 0,
        requestCount: 0,
        bytesStreamed: BigInt(0),
        totalCost: 0,
        currency: offer.currency,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    // Update offer stats
    await prisma.accessOffer.update({
      where: { id: offer.id },
      data: {
        totalExecutions: { increment: 1 },
      },
    })

    return NextResponse.json(
      {
        execution,
        policy,
        lease,
        message: 'Access granted. Use the lease credentials to stream data.',
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Execute access offer error:', error)
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to execute access offer' },
      { status: 500 }
    )
  }
}
