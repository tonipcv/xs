/**
 * XASE Voice Data Governance - Queue Client (BullMQ)
 * 
 * Cliente para processamento assíncrono de áudio
 * Reaproveita redis.ts existente
 */

import { Queue, Worker, Job } from 'bullmq'
import { getRedisClient } from './redis'

// Tipos de jobs
export interface AudioIngestJobData {
  datasetId: string
  fileKey: string
  tenantId: string
  uploadedBy: string
}

// Configuração de filas
const QUEUE_NAMES = {
  AUDIO_INGEST: 'audio:ingest',
} as const

// Cache de filas
const queues = new Map<string, Queue>()

/**
 * Obtém ou cria uma fila
 */
export function getQueue(name: string): Queue {
  if (queues.has(name)) {
    return queues.get(name)!
  }

  // BullMQ usa formato IORedis, extrair URL do env
  const redisUrl = process.env.REDIS_URL || 'redis://default:0413c8a2777157b441f7@dpbdp1.easypanel.host:45'
  
  const queue = new Queue(name, {
    connection: {
      host: redisUrl.includes('://') ? new URL(redisUrl).hostname : redisUrl,
      port: redisUrl.includes('://') ? parseInt(new URL(redisUrl).port || '6379') : 6379,
      password: redisUrl.includes('://') ? new URL(redisUrl).password : undefined,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600, // 24 horas
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // 7 dias
      },
    },
  })

  queues.set(name, queue)
  return queue
}

/**
 * Enfileira job de processamento de áudio
 */
export async function enqueueAudioIngest(data: AudioIngestJobData) {
  const queue = getQueue(QUEUE_NAMES.AUDIO_INGEST)
  
  const job = await queue.add('process-audio', data, {
    jobId: `${data.datasetId}-${data.fileKey}`,
    priority: 1,
  })

  return job
}

/**
 * Cria worker para processar jobs
 */
export function createWorker<T = any>(
  queueName: string,
  processor: (job: Job<T>) => Promise<any>,
  concurrency = 5
): Worker {
  // BullMQ usa formato IORedis
  const redisUrl = process.env.REDIS_URL || 'redis://default:0413c8a2777157b441f7@dpbdp1.easypanel.host:45'

  const worker = new Worker(queueName, processor, {
    connection: {
      host: redisUrl.includes('://') ? new URL(redisUrl).hostname : redisUrl,
      port: redisUrl.includes('://') ? parseInt(new URL(redisUrl).port || '6379') : 6379,
      password: redisUrl.includes('://') ? new URL(redisUrl).password : undefined,
    },
    concurrency,
    limiter: {
      max: 10,
      duration: 1000, // 10 jobs por segundo
    },
  })

  worker.on('completed', (job: Job) => {
    console.log(`[Queue] Job ${job.id} completed`)
  })

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err)
  })

  return worker
}

export { QUEUE_NAMES }
