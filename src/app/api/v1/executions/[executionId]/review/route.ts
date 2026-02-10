import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreateAccessReviewSchema } from '@/lib/validations/access-offer'
import { nanoid } from 'nanoid'

export async function POST(
  req: NextRequest,
  { params }: { params: { executionId: string } }
) {
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

    const { executionId } = params
    const body = await req.json()
    const validated = CreateAccessReviewSchema.parse(body)

    const execution = await prisma.policyExecution.findUnique({
      where: { executionId },
      include: { review: true },
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

    if (execution.review) {
      return NextResponse.json(
        { error: 'Review already submitted' },
        { status: 400 }
      )
    }

    // Create review
    const review = await prisma.accessReview.create({
      data: {
        offerId: execution.offerId,
        executionId: execution.id,
        buyerTenantId: user.tenant.id,
        policyClarityRating: validated.policyClarityRating,
        accessReliabilityRating: validated.accessReliabilityRating,
        evidenceQualityRating: validated.evidenceQualityRating,
        regulatorAccepted: validated.regulatorAccepted,
        regulatorName: validated.regulatorName,
        auditSuccessful: validated.auditSuccessful,
        auditFeedback: validated.auditFeedback,
        overallRating: validated.overallRating,
        review: validated.review,
        usedFor: validated.usedFor,
      },
    })

    // Update offer stats
    await prisma.accessOffer.update({
      where: { id: execution.offerId },
      data: {
        averageCompliance:
          validated.overallRating > 0
            ? { increment: validated.overallRating }
            : undefined,
        successfulAudits: validated.auditSuccessful
          ? { increment: 1 }
          : undefined,
      },
    })

    return NextResponse.json(review, { status: 201 })
  } catch (error: any) {
    console.error('Create review error:', error)
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create review' },
      { status: 500 }
    )
  }
}
