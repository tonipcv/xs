import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { getPresignedUploadUrl, isStorageConfigured } from '@/lib/xase/storage'
import { z } from 'zod'

const BodySchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Rate limiting stubbed

    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
    }

    const { datasetId } = await params
    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { fileName, contentType = 'application/octet-stream' } = parsed.data

    // Encontrar dataset pelo datasetId público
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId },
      select: { id: true, tenantId: true, datasetId: true },
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    // Somente o SUPPLIER dono do dataset pode fazer upload
    if (dataset.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const fileKey = `datasets/${dataset.datasetId}/${fileName}`
    const uploadUrl = await getPresignedUploadUrl(fileKey, 3600)

    // Marcar dataset como PENDING para processamento
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: { processingStatus: 'PENDING' },
    })

    // Instruções para processamento automático após upload
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const processUrl = `${baseUrl}/api/v1/datasets/${datasetId}/process`

    return NextResponse.json({ 
      uploadUrl, 
      fileKey, 
      expiresIn: 3600,
      // Instruções para o cliente
      nextStep: {
        description: "After upload completes, call process endpoint to start async audio processing",
        processUrl,
        method: "POST",
        body: { fileKey, fileName },
        headers: { "X-API-Key": apiKey }
      }
    })
  } catch (err: any) {
    console.error('[API] datasets/:datasetId/upload error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
