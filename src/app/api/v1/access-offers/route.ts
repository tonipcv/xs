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

    const { searchParams } = new URL(req.url)
    
    // Filters
    const riskClass = searchParams.get('riskClass')
    const language = searchParams.get('language')
    const jurisdiction = searchParams.get('jurisdiction')
    const maxPrice = searchParams.get('maxPrice')
    const useCase = searchParams.get('useCase')
    const supplierId = searchParams.get('supplierId')
    const status = searchParams.get('status') || 'ACTIVE'
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = {
      status: status as any,
    }

    if (riskClass) where.riskClass = riskClass
    if (language) where.language = language
    if (jurisdiction) where.jurisdiction = jurisdiction
    if (maxPrice) where.pricePerHour = { lte: parseFloat(maxPrice) }
    if (useCase) where.useCases = { has: useCase }
    if (supplierId) where.supplierTenantId = supplierId

    const [offers, total] = await Promise.all([
      prisma.accessOffer.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              organizationType: true,
            },
          },
          _count: {
            select: {
              executions: true,
              reviews: true,
            },
          },
        },
        orderBy: [
          { successfulAudits: 'desc' },
          { publishedAt: 'desc' },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.accessOffer.count({ where }),
    ])

    return NextResponse.json({
      offers,
      total,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('List access offers error:', error)
    return NextResponse.json(
      { error: 'Failed to list access offers' },
      { status: 500 }
    )
  }
}
