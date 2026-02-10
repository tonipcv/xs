// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'

/**
 * GET /api/v1/datasets/{datasetId}/metadata
 * Visualizar metadados sem consumir quota
 * Usado por clients para avaliar datasets antes de comprar acesso
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
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
    const dataset = await prisma.dataset.findFirst({
      where: { 
        datasetId,
        status: 'ACTIVE', // Apenas datasets ativos são visíveis
      },
      select: {
        // Metadados públicos (sem URLs de download)
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
        // Metadados de qualidade
        avgSnr: true,
        avgSpeechRatio: true,
        avgOverlapRatio: true,
        avgSilenceRatio: true,
        noiseLevel: true,
        // Metadados semânticos
        callType: true,
        intentCluster: true,
        emotionBand: true,
        outcomeFlag: true,
        // Metadados de governança
        consentStatus: true,
        allowedPurposes: true,
        jurisdiction: true,
        retentionExpiresAt: true,
        // Status
        status: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        // Tenant info (supplier)
        tenant: {
          select: {
            name: true,
            organizationType: true,
          },
        },
      },
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found or not active' }, { status: 404 })
    }

    // Verificar se há políticas ativas para este client
    const hasActivePolicy = await prisma.voiceAccessPolicy.findFirst({
      where: {
        dataset: { datasetId },
        clientTenantId: auth.tenantId,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
      },
      select: { id: true },
    })

    return NextResponse.json({
      ...dataset,
      // Indicar se o client já tem acesso
      hasAccess: !!hasActivePolicy,
    })
  } catch (err: any) {
    console.error('[API] GET /api/v1/datasets/:datasetId/metadata error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
