import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { getPresignedUrl, isStorageConfigured } from '@/lib/xase/storage'
import { enforceAccess, extractRequestContext } from '@/lib/xase/access-enforcement'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const QuerySchema = z.object({
  policyId: z.string().min(1),
  fileName: z.string().min(1).optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 600, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
    }

    const { datasetId } = await params
    const url = new URL(req.url)
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
    }
    const { policyId, fileName } = parsed.data

    // 🔥 ENFORCEMENT OBRIGATÓRIO - NENHUM ACESSO BYPASSA ISTO
    const requestContext = extractRequestContext(req, {
      clientTenantId: auth.tenantId,
      apiKeyId: auth.apiKeyId,
    })

    // Buscar dataset apenas para obter duração (enforcement valida existência)
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId },
      select: { 
        storageLocation: true,
        totalDurationHours: true,
      },
    })

    const requestedHours = dataset?.totalDurationHours || 1 // fallback

    const accessResult = await enforceAccess({
      datasetId,
      policyId,
      requestedHours,
      action: 'BATCH_DOWNLOAD',
      ...requestContext,
    })

    // ❌ ACESSO NEGADO
    if (!accessResult.granted) {
      return NextResponse.json({ 
        error: 'Access denied', 
        reason: accessResult.reason,
        code: accessResult.code,
        usage: accessResult.usage,
      }, { status: 403 })
    }

    // ✅ ACESSO PERMITIDO - Gerar signed URL
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    const fileKey = fileName 
      ? `${dataset.storageLocation}${fileName}`
      : dataset.storageLocation

    const downloadUrl = await getPresignedUrl(fileKey, 3600)

    return NextResponse.json({ 
      downloadUrl, 
      expiresIn: 3600,
      hoursAccessed: accessResult.hoursConsumed,
      cost: accessResult.cost,
      currency: accessResult.currency,
      usage: accessResult.usage,
    })
  } catch (err: any) {
    console.error('[API] datasets/:datasetId/download error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
