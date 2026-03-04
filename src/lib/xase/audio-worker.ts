/**
 * AUDIO WORKER - Processamento Assíncrono Real
 * Worker que processa arquivos de áudio de forma assíncrona
 * Compatível com Vercel (sem Redis/BullMQ)
 * 
 * PIPELINE: DRAFT → PROCESSING → COMPLETED/FAILED
 */

import { prisma } from '@/lib/prisma'
import { getPresignedUrl } from '@/lib/xase/storage'
import crypto from 'crypto'

export interface AudioProcessingJob {
  datasetId: string
  fileKey: string
  fileName: string
  retryCount?: number
}

function parsePcmWav(buf: Buffer): { sampleRate: number; channels: number; bitsPerSample: number; pcm: Int16Array } | null {
  let offset = 12
  let audioFormat = 1
  let channels = 1
  let sampleRate = 16000
  let bitsPerSample = 16
  let dataStart = -1
  let dataSize = 0
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)
    const chunkDataStart = offset + 8
    if (chunkId === 'fmt ') {
      audioFormat = buf.readUInt16LE(chunkDataStart)
      channels = buf.readUInt16LE(chunkDataStart + 2)
      sampleRate = buf.readUInt32LE(chunkDataStart + 4)
      bitsPerSample = buf.readUInt16LE(chunkDataStart + 14)
    } else if (chunkId === 'data') {
      dataStart = chunkDataStart
      dataSize = chunkSize
      break
    }
    offset = chunkDataStart + chunkSize + (chunkSize % 2)
  }
  if (audioFormat !== 1 || dataStart < 0 || dataStart + dataSize > buf.length) return null
  if (bitsPerSample !== 16) return { sampleRate, channels, bitsPerSample, pcm: new Int16Array(0) }
  const pcmBuf = buf.slice(dataStart, dataStart + dataSize)
  const pcm = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, Math.floor(pcmBuf.byteLength / 2))
  return { sampleRate, channels, bitsPerSample, pcm }
}

function mixToMonoInt16(pcm: Int16Array, channels: number): Int16Array {
  if (channels === 1) return pcm
  const frames = Math.floor(pcm.length / channels)
  const out = new Int16Array(frames)
  for (let i = 0; i < frames; i++) {
    let acc = 0
    for (let c = 0; c < channels; c++) acc += pcm[i * channels + c]
    out[i] = Math.max(-32768, Math.min(32767, Math.round(acc / channels)))
  }
  return out
}

function computeSnrFromPcm16(pcm: Int16Array, sampleRate: number): number {
  if (pcm.length === 0) return 0
  const totalDur = pcm.length / sampleRate
  const noiseSamples = Math.max(1, Math.min(pcm.length, Math.floor(Math.min(0.5, totalDur * 0.1) * sampleRate)))
  let noisePower = 0
  for (let i = 0; i < noiseSamples; i++) {
    const v = pcm[i] / 32768
    noisePower += v * v
  }
  noisePower /= noiseSamples
  let sigPower = 0
  let count = 0
  for (let i = noiseSamples; i < pcm.length; i++) {
    const v = pcm[i] / 32768
    sigPower += v * v
    count++
  }
  sigPower = count > 0 ? sigPower / count : 0
  if (noisePower <= 0) return 100
  const snr = 10 * Math.log10(sigPower / noisePower)
  return isFinite(snr) ? snr : 0
}

function computeSpeechSilenceRatios(pcm: Int16Array, sampleRate: number): { speechRatio: number; silenceRatio: number } {
  if (pcm.length === 0) return { speechRatio: 0, silenceRatio: 1 }
  const frameSize = Math.max(1, Math.floor(0.02 * sampleRate))
  const hopSize = Math.max(1, Math.floor(0.01 * sampleRate))
  const noiseFrames = Math.max(1, Math.floor((0.2 * sampleRate - frameSize) / hopSize))
  let noiseRmsAcc = 0
  let nf = 0
  for (let start = 0; start < noiseFrames * hopSize && start + frameSize <= pcm.length; start += hopSize) {
    let rms = 0
    for (let i = 0; i < frameSize; i++) {
      const v = pcm[start + i] / 32768
      rms += v * v
    }
    rms = Math.sqrt(rms / frameSize)
    noiseRmsAcc += rms
    nf++
  }
  const noiseRms = nf > 0 ? noiseRmsAcc / nf : 0.01
  const threshold = Math.max(0.001, noiseRms * 3)
  let speech = 0
  let total = 0
  for (let start = 0; start + frameSize <= pcm.length; start += hopSize) {
    let rms = 0
    for (let i = 0; i < frameSize; i++) {
      const v = pcm[start + i] / 32768
      rms += v * v
    }
    rms = Math.sqrt(rms / frameSize)
    if (rms >= threshold) speech++
    total++
  }
  const speechRatio = total > 0 ? speech / total : 0
  const silenceRatio = 1 - speechRatio
  return { speechRatio, silenceRatio }
}

export interface ProcessingResult {
  success: boolean
  durationSeconds?: number
  sampleRate?: number
  codec?: string
  channelCount?: number
  fileSize?: number
  fileHash?: string
  avgSnr?: number
  avgSpeechRatio?: number
  avgSilenceRatio?: number
  error?: string
}

/**
 * PROCESSAMENTO REAL DE ÁUDIO
 * Extrai metadados reais do arquivo (não estimativas)
 * Para MVP: análise básica via fetch + headers
 * Pós-MVP: adicionar librosa/ffprobe para análise completa
 */
export async function processAudioFile(
  fileKey: string,
  fileName: string
): Promise<ProcessingResult> {
  try {
    console.log(`[AudioWorker] Processing ${fileKey}`)
    const signedUrl = await getPresignedUrl(fileKey, 300)
    const headResp = await fetch(signedUrl, { method: 'HEAD' })
    if (!headResp.ok) {
      throw new Error(`Failed to fetch file metadata: ${headResp.status}`)
    }
    const contentLength = parseInt(headResp.headers.get('content-length') || '0')
    const contentType = headResp.headers.get('content-type') || 'application/octet-stream'

    let sampleRate = 16000
    let channelCount = 1
    let durationSeconds = 0
    let avgSnr: number | undefined
    let avgSpeechRatio: number | undefined
    let avgSilenceRatio: number | undefined
    let codec = 'unknown'

    const getResp = await fetch(signedUrl)
    if (!getResp.ok) {
      throw new Error(`Failed to download file: ${getResp.status}`)
    }
    const arrayBuf = await getResp.arrayBuffer()
    const buf = Buffer.from(arrayBuf)

    const hash = crypto.createHash('sha256').update(buf).digest('hex')

    const isWav = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE'
    if (isWav) {
      codec = 'wav'
      const parsed = parsePcmWav(buf)
      if (parsed && parsed.bitsPerSample === 16) {
        sampleRate = parsed.sampleRate
        channelCount = parsed.channels
        const totalSamples = parsed.pcm.length / channelCount
        durationSeconds = totalSamples / sampleRate
        const mono = mixToMonoInt16(parsed.pcm, channelCount)
        avgSnr = computeSnrFromPcm16(mono, sampleRate)
        const { speechRatio, silenceRatio } = computeSpeechSilenceRatios(mono, sampleRate)
        avgSpeechRatio = speechRatio
        avgSilenceRatio = silenceRatio
      } else {
        durationSeconds = contentLength > 0 ? contentLength / 32000 : 0
      }
    } else {
      if (contentType.includes('flac')) codec = 'flac'
      else if (contentType.includes('mp3')) codec = 'mp3'
      else if (contentType.includes('opus')) codec = 'opus'
      else if (contentType.includes('wav')) codec = 'wav'
      durationSeconds = contentLength > 0 ? contentLength / 32000 : 0
    }

    return {
      success: true,
      durationSeconds,
      sampleRate,
      codec,
      channelCount,
      fileSize: contentLength || buf.length,
      fileHash: hash,
      avgSnr,
      avgSpeechRatio,
      avgSilenceRatio,
    }
  } catch (error: any) {
    console.error(`[AudioWorker] Error processing ${fileKey}:`, error)
    return {
      success: false,
      error: error.message || 'Unknown processing error',
    }
  }
}

/**
 * WORKER PRINCIPAL - Processa um job de áudio
 * Atualiza dataset com metadados + cria DataAsset
 * Transições de estado: PROCESSING → COMPLETED/FAILED
 */
export async function processAudioJob(job: AudioProcessingJob): Promise<void> {
  const { datasetId, fileKey, fileName } = job

  try {
    console.log(`[AudioWorker] ===== STARTING JOB =====`)
    console.log(`[AudioWorker] datasetId:`, datasetId)
    console.log(`[AudioWorker] fileKey:`, fileKey)
    console.log(`[AudioWorker] fileName:`, fileName)

    // 1. Buscar dataset
    console.log(`[AudioWorker] Step 1: Finding dataset...`)
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId },
      select: {
        id: true,
        datasetId: true,
        processingStatus: true,
        totalDurationHours: true,
        numRecordings: true,
        language: true,
      },
    })

    console.log(`[AudioWorker] Dataset found:`, dataset)

    if (!dataset) {
      console.error(`[AudioWorker] Dataset ${datasetId} not found`)
      return
    }

    if (dataset.processingStatus === 'COMPLETED') {
      console.log(`[AudioWorker] Dataset ${datasetId} already completed`)
      return
    }

    // 2. Marcar como PROCESSING
    console.log(`[AudioWorker] Step 2: Marking as PROCESSING...`)
    console.log(`[AudioWorker] Dataset ID for update:`, dataset.id)
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: { 
        processingStatus: 'PROCESSING',
        processingError: null,
      },
    })
    console.log(`[AudioWorker] Step 2: Marked as PROCESSING successfully`)

    // 3. PROCESSAR ARQUIVO
    console.log(`[AudioWorker] Step 3: Processing audio file...`)
    console.log(`[AudioWorker] Calling processAudioFile with:`, { fileKey, fileName })
    const result = await processAudioFile(fileKey, fileName)
    console.log(`[AudioWorker] Step 3: Processing result:`, result)

    if (!result.success) {
      // Falha no processamento
      await prisma.dataset.update({
        where: { id: dataset.id },
        data: { 
          processingStatus: 'FAILED',
          processingError: result.error,
        },
      })
      
      console.error(`[AudioWorker] Processing failed for ${datasetId}: ${result.error}`)
      return
    }

    // 4. SUCESSO - Atualizar dataset (sem DataAsset por enquanto para debug)
    console.log(`[AudioWorker] Step 4: Updating dataset...`)
    
    const newDurationHours = dataset.totalDurationHours + ((result.durationSeconds || 0) / 3600)
    const newNumRecordings = dataset.numRecordings + 1
    
    console.log(`[AudioWorker] Updating dataset with:`, {
      newDurationHours,
      newNumRecordings,
      processingStatus: 'COMPLETED'
    })

    await prisma.dataset.update({
      where: { id: dataset.id },
      data: {
        totalDurationHours: newDurationHours,
        numRecordings: newNumRecordings,
        processingStatus: 'COMPLETED',
        processingError: null,
        // Atualizar médias agregadas (simples para MVP)
        avgSnr: result.avgSnr || null,
        avgSpeechRatio: result.avgSpeechRatio || null,
        avgSilenceRatio: result.avgSilenceRatio || null,
      },
    })
    
    console.log(`[AudioWorker] Dataset updated successfully`)

    console.log(`[AudioWorker] Successfully processed ${fileName} for dataset ${datasetId}`)
  } catch (error: any) {
    console.error(`[AudioWorker] Job failed for ${datasetId}:`, error)

    // Marcar como FAILED
    try {
      await prisma.dataset.update({
        where: { datasetId },
        data: { 
          processingStatus: 'FAILED',
          processingError: error.message || 'Unknown worker error',
        },
      })
    } catch (updateError) {
      console.error(`[AudioWorker] Failed to update error status:`, updateError)
    }
  }
}

/**
 * QUEUE SIMPLES - Para Vercel sem Redis
 * Processa jobs de forma sequencial
 * Pós-MVP: substituir por BullMQ real
 */
const processingQueue: AudioProcessingJob[] = []
let isProcessing = false

export async function enqueueAudioProcessing(job: AudioProcessingJob): Promise<void> {
  processingQueue.push(job)
  console.log(`[AudioWorker] Enqueued job for ${job.datasetId}, queue size: ${processingQueue.length}`)
  
  // Iniciar processamento se não estiver rodando
  if (!isProcessing) {
    processQueue()
  }
}

async function processQueue(): Promise<void> {
  if (isProcessing || processingQueue.length === 0) {
    return
  }

  isProcessing = true
  console.log(`[AudioWorker] Starting queue processing, ${processingQueue.length} jobs`)

  while (processingQueue.length > 0) {
    const job = processingQueue.shift()!
    
    try {
      await processAudioJob(job)
    } catch (error) {
      console.error(`[AudioWorker] Queue job failed:`, error)
    }
  }

  isProcessing = false
  console.log(`[AudioWorker] Queue processing completed`)
}
