import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreateAccessOfferSchema } from '@/lib/validations/access-offer'
import { nanoid } from 'nanoid'

export async function POST(
  req: NextRequest,
  context: any
) {
  try {
    const { params } = context as { params: Promise<{ datasetId: string }> }
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

    const { datasetId } = await params
    const body = await req.json()

    // Validate input
    const validated = CreateAccessOfferSchema.safeParse(body)
    if (!validated.success) {
      const flattened = validated.error.flatten()
      const issues = validated.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      }))
      return NextResponse.json(
        { error: 'Validation failed', details: flattened, issues },
        { status: 400 }
      )
    }

    // Verify dataset exists and belongs to supplier
    const dataset = await prisma.dataset.findUnique({
      where: { datasetId },
      select: { id: true, tenantId: true },
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
        title: validated.data.title,
        description: validated.data.description,
        allowedPurposes: validated.data.allowedPurposes,
        constraints: validated.data.constraints as any,
        jurisdiction: validated.data.jurisdiction,
        evidenceFormat: validated.data.evidenceFormat,
        complianceLevel: validated.data.complianceLevel,
        scopeHours: validated.data.scopeHours,
        scopeRecordings: validated.data.scopeRecordings,
        priceModel: validated.data.priceModel,
        pricePerHour: validated.data.pricePerHour,
        currency: validated.data.currency,
        language: validated.data.language,
        useCases: validated.data.useCases,
        riskClass: validated.data.riskClass,
        sampleMetadata: validated.data.sampleMetadata as any,
        expiresAt: validated.data.expiresAt ? new Date(validated.data.expiresAt) : null,
        status: 'DRAFT',
      },
    })

    return NextResponse.json(offer, { status: 201 })
  } catch (error: any) {
    const errPayload = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: String(error) }
    console.error('Create access offer error', errPayload)
    if (error?.name === 'ZodError') {
      const flattened = error.flatten ? error.flatten() : { fieldErrors: {}, formErrors: [] }
      const issues = Array.isArray(error.issues)
        ? error.issues.map((i: any) => ({ path: Array.isArray(i.path) ? i.path.join('.') : String(i.path), message: i.message, code: i.code }))
        : []
      return NextResponse.json(
        { error: 'Validation failed', details: flattened, issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create access offer' },
      { status: 500 }
    )
  }
}
