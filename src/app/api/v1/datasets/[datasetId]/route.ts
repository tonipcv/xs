import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Rate limiting stubbed

    const { datasetId } = await params
    const ds = await prisma.dataset.findFirst({
      where: { datasetId, tenantId: auth.tenantId },
      select: {
        datasetId: true,
        name: true,
        description: true,
        language: true,
        primaryLanguage: true,
        version: true,
        totalDurationHours: true,
        numRecordings: true,
        primarySampleRate: true,
        primaryCodec: true,
        primaryChannelCount: true,
        collectionStartTs: true,
        collectionEndTs: true,
        storageLocation: true,
        storageSize: true,
        datasetHash: true,
        avgSnr: true,
        avgSpeechRatio: true,
        avgOverlapRatio: true,
        avgSilenceRatio: true,
        avgNoiseLevel: true,
        callType: true,
        intentCluster: true,
        emotionBand: true,
        outcomeFlag: true,
        consentStatus: true,
        consentProofUri: true,
        consentProofHash: true,
        consentVersion: true,
        allowedPurposes: true,
        jurisdiction: true,
        retentionExpiresAt: true,
        processingStatus: true,
        processingError: true,
        status: true,
        publishedAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!ds) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    return NextResponse.json(ds)
  } catch (err) {
    console.error('[API] GET /api/v1/datasets/:datasetId error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
