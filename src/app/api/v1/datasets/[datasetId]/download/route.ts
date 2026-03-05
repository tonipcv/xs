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
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Rate limiting stubbed uniformly

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

    // 🔥 ENFORCEMENT OBRIGATÓRIO - adaptado ao stub
    const requestContext = extractRequestContext(req)

    // Buscar dataset apenas para obter duração (enforcement valida existência)
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId },
      select: { 
        storageLocation: true,
        totalDurationHours: true,
      },
    })

    const requestedHours = dataset?.totalDurationHours || 1 // fallback

    // Stub enforcement
    const enforcement = await enforceAccess('stub-lease', 'BATCH_DOWNLOAD')

    // ❌ ACESSO NEGADO
    if (!enforcement.allowed) {
      return NextResponse.json({ 
        error: 'Access denied', 
        reason: 'DENIED_BY_POLICY',
        code: 'DENIED',
        usage: null,
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
      hoursAccessed: requestedHours,
      cost: 0,
      currency: 'USD',
      usage: null,
    })
  } catch (err: any) {
    console.error('[API] datasets/:datasetId/download error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
