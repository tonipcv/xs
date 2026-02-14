import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  context: any
) {
  try {
    const { params } = context as { params: Promise<{ offerId: string }> }
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { offerId } = await params

    const offer = await prisma.accessOffer.findUnique({
      where: { offerId },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            organizationType: true,
          },
        },
        dataset: {
          select: {
            id: true,
            name: true,
            description: true,
            totalDurationHours: true,
            numRecordings: true,
            primaryLanguage: true,
            primarySampleRate: true,
            primaryCodec: true,
          },
        },
        reviews: {
          select: {
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            executions: true,
            reviews: true,
          },
        },
      },
    })

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    return NextResponse.json(offer)
  } catch (error: any) {
    console.error('Get access offer error', { name: error?.name, message: error?.message, stack: error?.stack })
    return NextResponse.json(
      { error: 'Failed to get access offer' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  context: any
) {
  try {
    const { params } = context as { params: Promise<{ offerId: string }> }
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

    const { offerId } = await params
    const body = await req.json()

    const offer = await prisma.accessOffer.findUnique({
      where: { offerId },
    })

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (offer.supplierTenantId !== user.tenant.id) {
      return NextResponse.json(
        { error: 'You do not own this offer' },
        { status: 403 }
      )
    }

    const updated = await prisma.accessOffer.update({
      where: { offerId },
      data: {
        ...body,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Update access offer error', { name: error?.name, message: error?.message, stack: error?.stack })
    return NextResponse.json(
      { error: 'Failed to update access offer' },
      { status: 500 }
    )
  }
}
