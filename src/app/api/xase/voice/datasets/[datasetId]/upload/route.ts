import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPresignedUploadUrl, isStorageConfigured } from '@/lib/xase/storage'
import { getTenantId } from '@/lib/xase/server-auth'
import { z } from 'zod'

const BodySchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })
    }

    const { datasetId } = await params
    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { fileName, contentType = 'application/octet-stream' } = parsed.data

    // Confirm dataset belongs to this tenant (supplier)
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId, tenantId },
      select: { datasetId: true },
    })
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    const fileKey = `datasets/${datasetId}/${fileName}`
    const uploadUrl = await getPresignedUploadUrl(fileKey, contentType, 3600)

    return NextResponse.json({ uploadUrl, fileKey, expiresIn: 3600 })
  } catch (err: any) {
    console.error('[API] session upload error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
