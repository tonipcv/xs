import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processAudioFile, updateDatasetMetrics, createDataAsset } from '@/lib/xase/audio-processor'
import { z } from 'zod'

function getSecret(req: NextRequest): string | null {
  return req.headers.get('x-webhook-secret') || req.headers.get('x-minio-webhook-secret')
}

function parseRecords(body: any): Array<{ key: string; size?: number }> {
  if (!body) return []
  if (Array.isArray(body?.Records)) {
    return body.Records.map((r: any) => ({ key: decodeURIComponent(r?.s3?.object?.key || ''), size: r?.s3?.object?.size }))
  }
  if (Array.isArray(body?.records)) {
    return body.records.map((r: any) => ({ key: decodeURIComponent(r?.s3?.object?.key || ''), size: r?.s3?.object?.size }))
  }
  return []
}

function extractDatasetIdFromKey(key: string): string | null {
  const m = key.match(/^datasets\/([^\/]+)\//)
  return m ? m[1] : null
}

export async function POST(req: NextRequest) {
  try {
    const secret = getSecret(req)
    if (!secret || secret !== process.env.MINIO_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))

    // Zod: aceitar formatos comuns de notificação do MinIO/S3
    const ObjSchema = z.object({
      s3: z.object({ object: z.object({ key: z.string().min(1), size: z.number().optional() }) }).optional()
    }).passthrough()
    const SchemaA = z.object({ Records: z.array(ObjSchema) })
    const SchemaB = z.object({ records: z.array(ObjSchema) })

    const parsedA = SchemaA.safeParse(body)
    const parsedB = SchemaB.safeParse(body)
    if (!parsedA.success && !parsedB.success) {
      return NextResponse.json({ error: 'Invalid webhook body' }, { status: 400 })
    }

    const rawList = parsedA.success
      ? parsedA.data.Records
      : (parsedB.success ? parsedB.data.records : [])
    const records = rawList.map((r: any) => ({ key: decodeURIComponent(r?.s3?.object?.key || ''), size: r?.s3?.object?.size }))
    if (!records.length) {
      return NextResponse.json({ ok: true, queued: 0 })
    }

    let processed = 0
    for (const rec of records) {
      const datasetPublicId = extractDatasetIdFromKey(rec.key)
      if (!datasetPublicId) continue

      const dataset = await prisma.dataset.findFirst({ where: { datasetId: datasetPublicId }, select: { id: true, tenantId: true, datasetId: true } })
      if (!dataset) continue

      // MVP: processar síncrono (leve)
      await prisma.dataset.update({ where: { id: dataset.id }, data: { processingStatus: 'PROCESSING' } })

      const result = await processAudioFile(rec.key, dataset.datasetId)
      
      if (result.success) {
        await createDataAsset(dataset.datasetId, rec.key, result)
        await updateDatasetMetrics(dataset.datasetId, result)
      } else {
        await prisma.dataset.update({ 
          where: { id: dataset.id }, 
          data: { processingStatus: 'FAILED', processingError: result.error } 
        })
      }
      
      processed++
    }

    return NextResponse.json({ ok: true, processed })
  } catch (err: any) {
    console.error('[Webhook][MinIO] error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
