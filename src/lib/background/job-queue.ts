/**
 * BACKGROUND JOB QUEUE
 * Reliable background job processing with Bull/Redis
 */

import { redis } from '@/lib/redis'

export type JobType =
  | 'dataset.process'
  | 'cohort.build'
  | 'entity.deduplicate'
  | 'billing.calculate'
  | 'webhook.deliver'
  | 'cache.invalidate'
  | 'export.generate'
  | 'audit.cleanup'

export interface Job<T = any> {
  id: string
  type: JobType
  data: T
  priority: number
  attempts: number
  maxAttempts: number
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  failedAt?: Date
  error?: string
  result?: any
}

export interface JobOptions {
  priority?: number
  maxAttempts?: number
  delay?: number
  timeout?: number
}

export class JobQueue {
  private static readonly QUEUE_PREFIX = 'jobs:'
  private static readonly DEFAULT_MAX_ATTEMPTS = 3
  private static readonly DEFAULT_TIMEOUT = 300000 // 5 minutes

  /**
   * Enqueue a job
   */
  static async enqueue<T>(
    type: JobType,
    data: T,
    options: JobOptions = {}
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    const job: Job<T> = {
      id: jobId,
      type,
      data,
      priority: options.priority || 0,
      attempts: 0,
      maxAttempts: options.maxAttempts || this.DEFAULT_MAX_ATTEMPTS,
      createdAt: new Date(),
    }

    const queueKey = this.getQueueKey(type)
    const jobKey = this.getJobKey(jobId)

    // Store job data
    await redis.set(jobKey, JSON.stringify(job), 'EX', 86400) // 24h TTL

    // Add to queue with priority
    const score = options.delay 
      ? Date.now() + options.delay
      : Date.now() - job.priority * 1000000 // Higher priority = lower score

    await redis.zadd(queueKey, score, jobId)

    return jobId
  }

  /**
   * Dequeue next job
   */
  static async dequeue(type: JobType): Promise<Job | null> {
    const queueKey = this.getQueueKey(type)
    const now = Date.now()

    // Get job with lowest score (highest priority or oldest)
    const results = await redis.zrangebyscore(queueKey, '-inf', now, 'LIMIT', 0, 1)

    if (results.length === 0) {
      return null
    }

    const jobId = results[0]
    const jobKey = this.getJobKey(jobId)

    // Remove from queue
    await redis.zrem(queueKey, jobId)

    // Get job data
    const jobData = await redis.get(jobKey)
    if (!jobData) {
      return null
    }

    const job = JSON.parse(jobData) as Job
    job.startedAt = new Date()
    job.attempts++

    // Update job
    await redis.set(jobKey, JSON.stringify(job), 'EX', 86400)

    return job
  }

  /**
   * Mark job as completed
   */
  static async complete(jobId: string, result?: any): Promise<void> {
    const jobKey = this.getJobKey(jobId)
    const jobData = await redis.get(jobKey)

    if (!jobData) {
      return
    }

    const job = JSON.parse(jobData) as Job
    job.completedAt = new Date()
    job.result = result

    await redis.set(jobKey, JSON.stringify(job), 'EX', 86400)
  }

  /**
   * Mark job as failed
   */
  static async fail(jobId: string, error: string): Promise<void> {
    const jobKey = this.getJobKey(jobId)
    const jobData = await redis.get(jobKey)

    if (!jobData) {
      return
    }

    const job = JSON.parse(jobData) as Job
    job.error = error

    if (job.attempts >= job.maxAttempts) {
      job.failedAt = new Date()
      await redis.set(jobKey, JSON.stringify(job), 'EX', 86400)
    } else {
      // Re-queue with exponential backoff
      const delay = Math.pow(2, job.attempts) * 1000 // 2s, 4s, 8s, etc.
      const queueKey = this.getQueueKey(job.type)
      const score = Date.now() + delay

      await redis.zadd(queueKey, score, jobId)
      await redis.set(jobKey, JSON.stringify(job), 'EX', 86400)
    }
  }

  /**
   * Get job status
   */
  static async getJob(jobId: string): Promise<Job | null> {
    const jobKey = this.getJobKey(jobId)
    const jobData = await redis.get(jobKey)

    if (!jobData) {
      return null
    }

    return JSON.parse(jobData) as Job
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(type: JobType): Promise<{
    pending: number
    processing: number
    completed: number
    failed: number
  }> {
    const queueKey = this.getQueueKey(type)
    const pending = await redis.zcard(queueKey)

    // Get all jobs for this type
    const pattern = `${this.QUEUE_PREFIX}job:*`
    const keys = await redis.keys(pattern)

    let processing = 0
    let completed = 0
    let failed = 0

    for (const key of keys) {
      const jobData = await redis.get(key)
      if (!jobData) continue

      const job = JSON.parse(jobData) as Job
      if (job.type !== type) continue

      if (job.completedAt) {
        completed++
      } else if (job.failedAt) {
        failed++
      } else if (job.startedAt) {
        processing++
      }
    }

    return { pending, processing, completed, failed }
  }

  /**
   * Process jobs with worker
   */
  static async processJobs<T>(
    type: JobType,
    processor: (data: T) => Promise<any>,
    options: {
      concurrency?: number
      pollInterval?: number
    } = {}
  ): Promise<void> {
    const concurrency = options.concurrency || 1
    const pollInterval = options.pollInterval || 1000

    const workers: Promise<void>[] = []

    for (let i = 0; i < concurrency; i++) {
      workers.push(this.worker(type, processor, pollInterval))
    }

    await Promise.all(workers)
  }

  /**
   * Single worker
   */
  private static async worker<T>(
    type: JobType,
    processor: (data: T) => Promise<any>,
    pollInterval: number
  ): Promise<void> {
    while (true) {
      try {
        const job = await this.dequeue(type)

        if (!job) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
          continue
        }

        try {
          const result = await Promise.race([
            processor(job.data),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Job timeout')), this.DEFAULT_TIMEOUT)
            ),
          ])

          await this.complete(job.id, result)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          await this.fail(job.id, errorMessage)
        }
      } catch (error) {
        console.error('[JobQueue] Worker error:', error)
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }
    }
  }

  /**
   * Cancel job
   */
  static async cancel(jobId: string): Promise<boolean> {
    const jobKey = this.getJobKey(jobId)
    const jobData = await redis.get(jobKey)

    if (!jobData) {
      return false
    }

    const job = JSON.parse(jobData) as Job

    // Remove from queue
    const queueKey = this.getQueueKey(job.type)
    await redis.zrem(queueKey, jobId)

    // Delete job
    await redis.del(jobKey)

    return true
  }

  /**
   * Clean up old jobs
   */
  static async cleanup(olderThanHours: number = 24): Promise<number> {
    const pattern = `${this.QUEUE_PREFIX}job:*`
    const keys = await redis.keys(pattern)
    const cutoff = Date.now() - olderThanHours * 3600 * 1000

    let deleted = 0

    for (const key of keys) {
      const jobData = await redis.get(key)
      if (!jobData) continue

      const job = JSON.parse(jobData) as Job
      const jobTime = job.completedAt || job.failedAt || job.createdAt

      if (jobTime && new Date(jobTime).getTime() < cutoff) {
        await redis.del(key)
        deleted++
      }
    }

    return deleted
  }

  /**
   * Retry failed jobs
   */
  static async retryFailed(type: JobType, limit: number = 100): Promise<number> {
    const pattern = `${this.QUEUE_PREFIX}job:*`
    const keys = await redis.keys(pattern)

    let retried = 0

    for (const key of keys.slice(0, limit)) {
      const jobData = await redis.get(key)
      if (!jobData) continue

      const job = JSON.parse(jobData) as Job
      if (job.type !== type || !job.failedAt) continue

      // Reset job
      job.attempts = 0
      job.failedAt = undefined
      job.error = undefined
      job.startedAt = undefined

      // Re-queue
      const queueKey = this.getQueueKey(type)
      await redis.zadd(queueKey, Date.now(), job.id)
      await redis.set(key, JSON.stringify(job), 'EX', 86400)

      retried++
    }

    return retried
  }

  /**
   * Helper methods
   */
  private static getQueueKey(type: JobType): string {
    return `${this.QUEUE_PREFIX}queue:${type}`
  }

  private static getJobKey(jobId: string): string {
    return `${this.QUEUE_PREFIX}job:${jobId}`
  }

  /**
   * Bulk enqueue
   */
  static async enqueueBatch<T>(
    type: JobType,
    items: T[],
    options: JobOptions = {}
  ): Promise<string[]> {
    const jobIds: string[] = []

    for (const item of items) {
      const jobId = await this.enqueue(type, item, options)
      jobIds.push(jobId)
    }

    return jobIds
  }

  /**
   * Get all pending jobs
   */
  static async getPendingJobs(type: JobType, limit: number = 100): Promise<Job[]> {
    const queueKey = this.getQueueKey(type)
    const jobIds = await redis.zrange(queueKey, 0, limit - 1)

    const jobs: Job[] = []

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId)
      if (job) {
        jobs.push(job)
      }
    }

    return jobs
  }

  /**
   * Pause queue
   */
  static async pauseQueue(type: JobType): Promise<void> {
    const pauseKey = `${this.QUEUE_PREFIX}paused:${type}`
    await redis.set(pauseKey, '1')
  }

  /**
   * Resume queue
   */
  static async resumeQueue(type: JobType): Promise<void> {
    const pauseKey = `${this.QUEUE_PREFIX}paused:${type}`
    await redis.del(pauseKey)
  }

  /**
   * Check if queue is paused
   */
  static async isPaused(type: JobType): Promise<boolean> {
    const pauseKey = `${this.QUEUE_PREFIX}paused:${type}`
    const paused = await redis.get(pauseKey)
    return paused === '1'
  }
}
