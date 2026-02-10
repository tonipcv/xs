import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreateAccessOfferSchema } from '@/lib/validations/access-offer'
import { nanoid } from 'nanoid'

export async function POST(
  req: NextRequest,
  { params }: { params: { datasetId: string } }
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

    const { datasetId } = params
    const body = await req.json()

    // Validate input
    const validated = CreateAccessOfferSchema.parse(body)

    // Verify dataset exists and belongs to supplier
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    if (dataset.tenantId !== user.tenant.id) {
      return NextResponse.json(
        { error: 'You do not own this dataset' },
        { status: 403 }
      )
    }

    // Create AccessOffer
    const offer = await prisma.accessOffer.create({
      data: {
        offerId: `offer_${nanoid(16)}`,
        datasetId: dataset.id,
        supplierTenantId: user.tenant.id,
        title: validated.title,
        description: validated.description,
        allowedPurposes: validated.allowedPurposes,
        constraints: validated.constraints as any,
        jurisdiction: validated.jurisdiction,
        evidenceFormat: validated.evidenceFormat,
        complianceLevel: validated.complianceLevel,
        scopeHours: validated.scopeHours,
        scopeRecordings: validated.scopeRecordings,
        priceModel: validated.priceModel,
        pricePerHour: validated.pricePerHour,
        currency: validated.currency,
        language: validated.language,
        useCases: validated.useCases,
        riskClass: validated.riskClass,
        sampleMetadata: validated.sampleMetadata as any,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
        status: 'DRAFT',
      },
    })

    return NextResponse.json(offer, { status: 201 })
  } catch (error: any) {
    console.error('Create access offer error:', error)
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create access offer' },
      { status: 500 }
    )
  }
}
