// @ts-nocheck
/**
 * Audio Processor - MVP Internal Worker
 * Processa arquivos de áudio de forma síncrona (leve) para MVP
 * Sem dependências externas (Redis/BullMQ)
 */

import { prisma } from '@/lib/prisma'
import { getPresignedUrl } from '@/lib/xase/storage'
import crypto from 'crypto'

interface ProcessingResult {
  success: boolean
  durationSeconds?: number
  sampleRate?: number
  codec?: string
  channelCount?: number
  fileSize?: number
  fileHash?: string
  error?: string
}

/**
 * Processa um arquivo de áudio (MVP: apenas metadados básicos)
 * Para MVP: extrai apenas duração e hash via HEAD request
 * Pós-MVP: adicionar librosa, VAD, SNR, etc
 */
export async function processAudioFile(
  fileKey: string,
  datasetId: string
): Promise<ProcessingResult> {
  try {
    // Para MVP: estimativa baseada em tamanho do arquivo
    // Pós-MVP: usar librosa/ffprobe para metadados reais
    
    // Simular processamento leve (HEAD request para obter tamanho)
    const signedUrl = await getPresignedUrl(fileKey, 60)
    
    // Fetch HEAD para obter metadados do arquivo
    const response = await fetch(signedUrl, { method: 'HEAD' })
    if (!response.ok) {
      throw new Error(`Failed to fetch file metadata: ${response.status}`)
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0')
    const contentType = response.headers.get('content-type') || 'audio/wav'

    // Estimativa grosseira de duração (WAV 16kHz mono = ~32KB/s)
    // Pós-MVP: substituir por análise real
    const estimatedDurationSeconds = contentLength / 32000

    // Hash do fileKey (não do conteúdo, para MVP)
    // Pós-MVP: baixar arquivo e calcular SHA-256 real
    const fileHash = crypto.createHash('sha256').update(fileKey).digest('hex')

    // Detectar codec do content-type
    let codec = 'wav'
    if (contentType.includes('flac')) codec = 'flac'
    else if (contentType.includes('mp3')) codec = 'mp3'
    else if (contentType.includes('opus')) codec = 'opus'

    return {
      success: true,
      durationSeconds: estimatedDurationSeconds,
      sampleRate: 16000, // Assumir 16kHz para MVP
      codec,
      channelCount: 1, // Assumir mono para MVP
      fileSize: contentLength,
      fileHash,
    }
  } catch (error: any) {
    console.error('[AudioProcessor] Error processing file:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Atualiza dataset com metadados do arquivo processado
 */
export async function updateDatasetMetrics(
  datasetId: string,
  result: ProcessingResult
): Promise<void> {
  if (!result.success || !result.durationSeconds) return

  const dataset = await prisma.dataset.findFirst({
    where: { datasetId },
    select: { id: true, totalDurationHours: true, numRecordings: true },
  })

  if (!dataset) {
    throw new Error('Dataset not found')
  }

  const newDurationHours = dataset.totalDurationHours + (result.durationSeconds / 3600)
  const newNumRecordings = dataset.numRecordings + 1

  await prisma.dataset.update({
    where: { id: dataset.id },
    data: {
      totalDurationHours: newDurationHours,
      numRecordings: newNumRecordings,
      processingStatus: 'COMPLETED',
    },
  })
}

/**
 * Cria um AudioSegment no banco
 */
export async function createAudioSegment(
  datasetId: string,
  fileKey: string,
  result: ProcessingResult
): Promise<void> {
  if (!result.success) return

  const dataset = await prisma.dataset.findFirst({
    where: { datasetId },
    select: { id: true, language: true },
  })

  if (!dataset) return

  const segmentId = 'seg_' + crypto.randomBytes(12).toString('hex')

  await prisma.audioSegment.create({
    data: {
      datasetId: dataset.id,
      segmentId,
      fileKey,
      durationSec: result.durationSeconds || 0,
      sampleRate: result.sampleRate || 16000,
      codec: result.codec || 'wav',
      channelCount: result.channelCount || 1,
      fileSize: result.fileSize ? BigInt(result.fileSize) : null,
      fileHash: result.fileHash || null,
      language: dataset.language,
    },
  })
}
