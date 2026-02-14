import { Job } from 'bullmq'
import { createWorker, QUEUE_NAMES, AudioIngestJobData } from '@/lib/queue'
import { prisma } from '@/lib/prisma'

async function processAudio(job: Job<AudioIngestJobData>) {
  const { datasetId, fileKey } = job.data
  console.log(`[Worker][audio:ingest] Start job ${job.id} dataset=${datasetId} key=${fileKey}`)

  try {
    // Marca dataset como PROCESSING
    await prisma.dataset.updateMany({
      where: { datasetId },
      data: { processingStatus: 'PROCESSING' },
    })

    // MVP: processamento simplificado
    // Futuro: extrair duração, sample rate, codec, etc. e atualizar camadas 1-2

    // Atualiza contadores mínimos (numRecordings +1)
    const ds = await prisma.dataset.findFirst({ where: { datasetId }, select: { id: true, numRecordings: true } })
    if (ds) {
      await prisma.dataset.update({
        where: { id: ds.id },
        data: {
          numRecordings: (ds.numRecordings ?? 0) + 1,
          processingStatus: 'COMPLETED',
        },
      })
    }

    // Log simples
    await prisma.auditLog.create({
      data: {
        tenantId: undefined,
        action: 'AUDIO_INGESTED',
        resourceType: 'DATASET',
        resourceId: datasetId,
        metadata: JSON.stringify({ fileKey }),
        status: 'SUCCESS',
      },
    }).catch(() => {})
    console.log(`[Worker][audio:ingest] Completed job ${job.id} dataset=${datasetId}`)
  } catch (e: any) {
    console.error(`[Worker][audio:ingest] Error job ${job.id}:`, e?.message || e)
    // Em caso de erro, marcar FAILED no dataset (opcional)
    await prisma.dataset.updateMany({ where: { datasetId }, data: { processingStatus: 'FAILED', processingError: String(e?.message || e) } })
    throw e
  }

  return { ok: true }
}

export function start() {
  return createWorker<AudioIngestJobData>(QUEUE_NAMES.AUDIO_INGEST, processAudio, 3)
}

// Se executado diretamente: inicia o worker
if (require.main === module) {
  start()
}
