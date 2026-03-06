/**
 * Job Queue for Data Preparation Pipeline
 * Manages preparation jobs with BullMQ
 */

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

export interface PreparationJobData {
  datasetId: string;
  jobId: string;
  request: {
    task: string;
    modality: string;
    target: {
      runtime: string;
      format: string;
    };
    config?: Record<string, unknown>;
  };
  priority?: number;
}

export interface PreparationJobResult {
  success: boolean;
  outputPaths?: string[];
  manifestPath?: string;
  error?: string;
  stats?: {
    recordCount: number;
    shardCount: number;
    totalSizeBytes: number;
  };
}

export interface JobQueueConfig {
  redisUrl: string;
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
}

export class PreparationJobQueue {
  private queue: Queue<PreparationJobData>;
  private redis: Redis;
  private config: JobQueueConfig;

  constructor(config: JobQueueConfig) {
    this.config = config;
    this.redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<PreparationJobData>('preparation-jobs', {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
        ...config.defaultJobOptions,
      },
    });
  }

  async addJob(data: PreparationJobData): Promise<Job<PreparationJobData>> {
    return this.queue.add(`prepare-${data.datasetId}`, data, {
      jobId: data.jobId,
      priority: data.priority ?? 10,
    });
  }

  async getJob(jobId: string): Promise<Job<PreparationJobData> | undefined> {
    return this.queue.getJob(jobId);
  }

  async getJobStatus(jobId: string): Promise<string> {
    const job = await this.getJob(jobId);
    if (!job) return 'unknown';
    return await job.getState();
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job) return false;
    
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      return false;
    }
    
    await job.remove();
    return true;
  }

  async getJobProgress(jobId: string): Promise<number> {
    const job = await this.getJob(jobId);
    if (!job) return 0;
    const progress = job.progress;
    if (typeof progress === 'number') {
      return progress;
    }
    if (typeof progress === 'object' && progress !== null && 'value' in progress) {
      return (progress as { value: number }).value ?? 0;
    }
    return 0;
  }

  async pauseQueue(): Promise<void> {
    await this.queue.pause();
  }

  async resumeQueue(): Promise<void> {
    await this.queue.resume();
  }

  async getQueueMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    return {
      waiting: await this.queue.getWaitingCount(),
      active: await this.queue.getActiveCount(),
      completed: await this.queue.getCompletedCount(),
      failed: await this.queue.getFailedCount(),
      delayed: await this.queue.getDelayedCount(),
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.redis.quit();
  }

  getQueue(): Queue<PreparationJobData> {
    return this.queue;
  }
}

export function createJobQueue(redisUrl: string): PreparationJobQueue {
  return new PreparationJobQueue({ redisUrl });
}
