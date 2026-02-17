import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'
import { enqueueAudioProcessing } from '@/lib/xase/audio-worker'

/**
 * POST /api/v1/datasets/{datasetId}/process
 * Processa arquivos de áudio após upload
 * Funciona de forma síncrona no Vercel (sem workers externos)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { datasetId } = await params
    const body = await req.json()
    const { fileKey, fileName } = body

    if (!fileKey) {
      return NextResponse.json({ error: 'fileKey is required' }, { status: 400 })
    }

    if (!fileName) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
    }

    // Buscar dataset
    const dataset = await prisma.dataset.findFirst({
      where: { 
        datasetId,
        tenantId: auth.tenantId,
      },
      select: { 
        id: true, 
        datasetId: true,
        processingStatus: true,
      },
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    // Verificar se já está sendo processado
    if (dataset.processingStatus === 'PROCESSING') {
      return NextResponse.json({ 
        message: 'Already processing',
        status: 'PROCESSING'
      })
    }

    if (dataset.processingStatus === 'COMPLETED') {
      return NextResponse.json({ 
        message: 'Already completed',
        status: 'COMPLETED'
      })
    }

    // 🔥 PROCESSAR DE FORMA SÍNCRONA (MVP)
    // Em produção com alta carga, usar fila assíncrona real (BullMQ/Redis)
    try {
      console.log('[API] ===== STARTING PROCESSING =====')
      console.log('[API] datasetId:', datasetId)
      console.log('[API] fileKey:', fileKey)
      console.log('[API] fileName:', fileName)
      
      console.log('[API] Step 1: Enqueuing...')
      await enqueueAudioProcessing({
        datasetId,
        fileKey,
        fileName,
      })
      console.log('[API] Step 1: Enqueued successfully')

      // Processar imediatamente para MVP
      console.log('[API] Step 2: Importing processAudioJob...')
      const { processAudioJob } = await import('@/lib/xase/audio-worker')
      console.log('[API] Step 2: Imported successfully')
      
      console.log('[API] Step 3: Calling processAudioJob...')
      await processAudioJob({
        datasetId,
        fileKey,
        fileName,
      })
      console.log('[API] Step 3: Processing completed successfully')

      return NextResponse.json({
        success: true,
        message: 'Audio processed successfully',
        status: 'COMPLETED',
        datasetId,
        fileKey,
        fileName,
      })
    } catch (processingError: any) {
      console.error('[API] ===== PROCESSING ERROR =====')
      console.error('[API] Error message:', processingError.message)
      console.error('[API] Error stack:', processingError.stack)
      console.error('[API] Full error:', processingError)
      return NextResponse.json({
        success: false,
        message: 'Processing failed',
        error: processingError.message,
        status: 'FAILED',
      }, { status: 500 })
    }
  } catch (err: any) {
    console.error('[API] datasets/:datasetId/process error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
