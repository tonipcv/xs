/**
 * BullMQ Worker for Data Preparation Pipeline
 * Consumes jobs from the queue and executes DataPreparer
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { DataPreparer } from './data-preparer';
import { PreparationJobData, PreparationJobResult } from './job-queue';
import { PreparationJob, PreparationRequest } from './preparation.types';
import { prisma } from '@/lib/prisma';

export interface WorkerConfig {
  redisUrl: string;
  concurrency?: number;
  maxStalledCount?: number;
  stalledInterval?: number;
}

export class PreparationWorker {
  private worker: Worker<PreparationJobData, PreparationJobResult>;
  private redis: Redis;
  private dataPreparer: DataPreparer;
  private isRunning: boolean = false;

  constructor(config: WorkerConfig) {
    this.redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    this.dataPreparer = new DataPreparer();

    this.worker = new Worker<PreparationJobData, PreparationJobResult>(
      'preparation-jobs',
      this.processJob.bind(this),
      {
        connection: this.redis,
        concurrency: config.concurrency ?? 3,
        maxStalledCount: config.maxStalledCount ?? 3,
        stalledInterval: config.stalledInterval ?? 30000,
        lockDuration: 300000, // 5 minutes
        removeOnComplete: {
          count: 100,
        },
        removeOnFail: {
          count: 50,
        },
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job, result) => {
      console.log(`[Worker] Job ${job.id} completed successfully`, {
        outputPaths: result.outputPaths,
        recordCount: result.stats?.recordCount,
      });
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[Worker] Job ${job?.id} failed:`, error.message);
    });

    this.worker.on('progress', (job, progress) => {
      console.log(`[Worker] Job ${job.id} progress: ${progress}%`);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`[Worker] Job ${jobId} stalled`);
    });

    this.worker.on('error', (error) => {
      console.error('[Worker] Error:', error);
    });
  }

  private async processJob(
    job: Job<PreparationJobData>
  ): Promise<PreparationJobResult> {
    const { datasetId, jobId, request } = job.data;

    console.log(`[Worker] Processing job ${jobId} for dataset ${datasetId}`);

    try {
      // Update job status to normalizing
      await this.updateJobStatusInDB(jobId, 'normalizing', 10);
      await job.updateProgress(10);

      // Fetch tenantId from database
      const dbJob = await prisma.preparationJob.findUnique({
        where: { id: jobId },
        select: { tenantId: true },
      });

      if (!dbJob) {
        throw new Error(`Job ${jobId} not found in database`);
      }

      // Construct PreparationJob
      const preparationJob: PreparationJob = {
        id: jobId,
        datasetId,
        tenantId: dbJob.tenantId,
        request: request as PreparationRequest,
        startTime: Date.now(),
        status: 'normalizing',
        progress: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Execute preparation pipeline
      const result = await this.dataPreparer.prepare(preparationJob);

      // Update job in database with final status
      await prisma.preparationJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          outputPath: result.delivery.manifestPath,
          manifestUrl: result.delivery.downloadUrls[0],
          completedAt: new Date(),
          normalizationResult: result.normalization as any,
          compilationResult: result.compilation as any,
        },
      });

      await job.updateProgress(100);

      return {
        success: true,
        outputPaths: result.delivery.downloadUrls,
        manifestPath: result.delivery.manifestPath,
        stats: {
          recordCount: result.compilation.recordCount,
          shardCount: result.compilation.shardCount,
          totalSizeBytes: result.compilation.totalSizeBytes,
        },
      };
    } catch (error) {
      console.error(`[Worker] Job ${jobId} failed:`, error);

      // Update job status to failed
      await prisma.preparationJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        },
      });

      throw error;
    }
  }

  private async updateJobStatusInDB(
    jobId: string,
    status: PreparationJob['status'],
    progress: number
  ): Promise<void> {
    await prisma.preparationJob.update({
      where: { id: jobId },
      data: {
        status,
        progress,
        updatedAt: new Date(),
      },
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Worker] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[Worker] Started and ready to process jobs');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[Worker] Stopping...');
    await this.worker.close();
    await this.redis.quit();
    this.isRunning = false;
    console.log('[Worker] Stopped');
  }

  async pause(): Promise<void> {
    await this.worker.pause();
    console.log('[Worker] Paused');
  }

  async resume(): Promise<void> {
    await this.worker.resume();
    console.log('[Worker] Resumed');
  }

  getRunningStatus(): boolean {
    return this.isRunning;
  }

  getWorkerId(): string {
    return this.worker.id;
  }
}

export function createWorker(redisUrl: string): PreparationWorker {
  return new PreparationWorker({ redisUrl });
}
