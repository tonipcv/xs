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
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting stubbed

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
    const hasActivePolicy = await prisma.accessPolicy.findFirst({
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
