import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/v1/access-offers
// Optional query params: riskClass, language, jurisdiction, maxPrice, useCase, supplierId, dataType, regulatory, limit, offset
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const riskClass = searchParams.get('riskClass') || undefined
    const language = searchParams.get('language') || undefined
    const jurisdiction = searchParams.get('jurisdiction') || undefined
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined
    const useCase = searchParams.get('useCase') || undefined
    const supplierId = searchParams.get('supplierId') || undefined
    const dataType = searchParams.get('dataType') || undefined
    const regulatory = searchParams.get('regulatory') || undefined
    const limit = parseInt(searchParams.get('limit') || '60')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = {}
    if (riskClass) where.riskClass = riskClass
    if (language) where.language = language
    if (jurisdiction) where.jurisdiction = jurisdiction
    if (typeof maxPrice === 'number' && !Number.isNaN(maxPrice)) where.pricePerHour = { lte: maxPrice }
    if (useCase) where.useCases = { has: useCase }
    if (supplierId) where.supplierTenantId = supplierId
    if (regulatory) where.regulatoryFrameworks = { has: regulatory }

    // dataType filter via related dataset assets (AudioSegment generalized as DataAsset)
    // If filtering by dataType, constrain via related dataset relation
    if (dataType) {
      where.dataset = { audioSegments: { some: { dataType: dataType as any } } }
    }

    const offersRaw = await prisma.accessOffer.findMany({
      where,
      orderBy: [
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        offerId: true,
        title: true,
        description: true,
        pricePerHour: true,
        currency: true,
        scopeHours: true,
        riskClass: true,
        jurisdiction: true,
        language: true,
        useCases: true,
        successfulAudits: true,
        totalExecutions: true,
        regulatoryFrameworks: true,
        dataset: {
          select: {
            id: true,
            datasetId: true,
            audioSegments: {
              take: 1,
              where: { dataType: { not: null } },
              select: { dataType: true },
            },
          },
        },
        supplier: {
          select: { name: true, organizationType: true },
        },
      },
      take: limit,
      skip: offset,
    })

    // Map dataset-derived dataType to top-level field for UI convenience
    const offers = offersRaw
      .filter((o: any) => {
        if (!dataType) return true
        // If filtering by dataType, ensure dataset relation matched
        return !!o.dataset
      })
      .map((o: any) => {
        const dt = o?.dataset?.audioSegments?.[0]?.dataType || null
        const { dataset, ...rest } = o
        return { ...rest, dataType: dt || undefined }
      })

    return NextResponse.json({ offers, limit, offset })
  } catch (error: any) {
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Failed to list access offers', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
