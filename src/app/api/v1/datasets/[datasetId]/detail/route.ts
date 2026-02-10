// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const { datasetId } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const dataset = await prisma.dataset.findUnique({
      where: { datasetId },
      select: {
        id: true,
        datasetId: true,
        name: true,
        description: true,
        language: true,
        primaryLanguage: true,
        primarySampleRate: true,
        primaryCodec: true,
        primaryChannelCount: true,
        totalDurationHours: true,
        numRecordings: true,
        storageSize: true,
        totalSizeBytes: true,
        status: true,
        processingStatus: true,
        consentStatus: true,
        createdAt: true,
        updatedAt: true,
        tenantId: true,
      }
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    if (dataset.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(dataset)
  } catch (error: any) {
    console.error('GET /datasets/[datasetId]/detail error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
