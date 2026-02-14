// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'

export async function GET(req: NextRequest, context: any) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 1200, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { datasetId } = await params
    const ds = await prisma.dataset.findFirst({
      where: { datasetId, tenantId: auth.tenantId },
      select: {
        datasetId: true,
        name: true,
        description: true,
        language: true,
        version: true,
        totalDurationHours: true,
        numRecordings: true,
        sampleRate: true,
        codec: true,
        channelCount: true,
        collectionStartTs: true,
        collectionEndTs: true,
        storageLocation: true,
        storageSize: true,
        datasetHash: true,
        avgSnr: true,
        avgSpeechRatio: true,
        avgOverlapRatio: true,
        avgSilenceRatio: true,
        noiseLevel: true,
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
  } catch (err: any) {
    console.error('[API] GET /api/v1/datasets/:datasetId error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
