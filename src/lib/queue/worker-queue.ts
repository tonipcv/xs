/**
 * Worker Queue System with BullMQ
 * Asynchronous processing for heavy operations
 * F3-016: Worker Queue para Processamento Assíncrono
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export type JobType =
  | 'audio_processing'
  | 'dataset_indexing'
  | 'compliance_check'
  | 'audit_export'
  | 'evidence_generation'
  | 'webhook_delivery'
  | 'email_send'
  | 'cache_warming';

export interface JobData {
  type: JobType;
  payload: any;
  tenantId?: string;
  userId?: string;
  priority?: number;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

// Create queues for different job types
const queues = {
  audio: new Queue('audio-processing', { connection }),
  dataset: new Queue('dataset-indexing', { connection }),
  compliance: new Queue('compliance-check', { connection }),
  audit: new Queue('audit-export', { connection }),
  evidence: new Queue('evidence-generation', { connection }),
  webhook: new Queue('webhook-delivery', { connection }),
  email: new Queue('email-send', { connection }),
  cache: new Queue('cache-warming', { connection }),
};

/**
 * Add job to queue
 */
export async function addJob(data: JobData): Promise<string> {
  const queueName = getQueueName(data.type);
  const queue = queues[queueName];

  if (!queue) {
    throw new Error(`Unknown job type: ${data.type}`);
  }

  const job = await queue.add(
    data.type,
    data.payload,
    {
      priority: data.priority || 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 60 * 60, // 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60, // 7 days
      },
    }
  );

  // Log job creation
  await prisma.auditLog.create({
    data: {
      action: 'JOB_QUEUED',
      resourceType: 'worker_job',
      resourceId: job.id,
      tenantId: data.tenantId,
      userId: data.userId,
      metadata: JSON.stringify({
        type: data.type,
        queueName,
        priority: data.priority,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  }).catch(() => {});

  console.log(`Job queued: ${job.id} (${data.type})`);

  return job.id;
}

/**
 * Get queue name from job type
 */
function getQueueName(type: JobType): keyof typeof queues {
  const mapping: Record<JobType, keyof typeof queues> = {
    audio_processing: 'audio',
    dataset_indexing: 'dataset',
    compliance_check: 'compliance',
    audit_export: 'audit',
    evidence_generation: 'evidence',
    webhook_delivery: 'webhook',
    email_send: 'email',
    cache_warming: 'cache',
  };

  return mapping[type];
}

/**
 * Process audio files
 */
async function processAudio(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  console.log(`Processing audio job: ${job.id}`);

  try {
    const { datasetId, audioFiles } = job.data;

    // Simulate audio processing
    for (const file of audioFiles) {
      await job.updateProgress(
        ((audioFiles.indexOf(file) + 1) / audioFiles.length) * 100
      );

      // Process audio file (placeholder)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      data: {
        datasetId,
        processedFiles: audioFiles.length,
      },
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Index dataset for search
 */
async function indexDataset(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  console.log(`Indexing dataset: ${job.id}`);

  try {
    const { datasetId } = job.data;

    // Fetch dataset
    const dataset = await prisma.dataset.findUnique({
      where: { datasetId },
    });

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // Index dataset (placeholder)
    await job.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 500));
    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    return {
      success: true,
      data: {
        datasetId,
        indexed: true,
      },
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run compliance check
 */
async function runComplianceCheck(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  console.log(`Running compliance check: ${job.id}`);

  try {
    const { tenantId, framework } = job.data;

    // Run compliance checks (placeholder)
    await job.updateProgress(33);
    await new Promise(resolve => setTimeout(resolve, 300));
    await job.updateProgress(66);
    await new Promise(resolve => setTimeout(resolve, 300));
    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    return {
      success: true,
      data: {
        tenantId,
        framework,
        compliant: true,
        score: 95,
      },
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Generate audit export
 */
async function generateAuditExport(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  console.log(`Generating audit export: ${job.id}`);

  try {
    const { tenantId, format, filters } = job.data;

    // Generate export (placeholder)
    await job.updateProgress(25);
    await new Promise(resolve => setTimeout(resolve, 500));
    await job.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 500));
    await job.updateProgress(75);
    await new Promise(resolve => setTimeout(resolve, 500));
    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    return {
      success: true,
      data: {
        tenantId,
        format,
        exportId: `export_${Date.now()}`,
        recordCount: 1000,
      },
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Generate evidence bundle
 */
async function generateEvidence(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  console.log(`Generating evidence: ${job.id}`);

  try {
    const { sessionId } = job.data;

    // Generate evidence bundle (placeholder)
    await job.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 300));
    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    return {
      success: true,
      data: {
        sessionId,
        evidenceUrl: `s3://evidence/${sessionId}.bundle`,
      },
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Deliver webhook
 */
async function deliverWebhook(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  console.log(`Delivering webhook: ${job.id}`);

  try {
    const { url, payload, signature } = job.data;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return {
      success: true,
      data: {
        status: response.status,
        url,
      },
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Send email
 */
async function sendEmailJob(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  console.log(`Sending email: ${job.id}`);

  try {
    const { to, subject, html } = job.data;

    // Send email (placeholder - integrate with email service)
    await new Promise(resolve => setTimeout(resolve, 200));

    const duration = Date.now() - startTime;

    return {
      success: true,
      data: {
        to,
        subject,
      },
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Warm cache
 */
async function warmCache(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  console.log(`Warming cache: ${job.id}`);

  try {
    const { strategy, tenantId } = job.data;

    // Warm cache (placeholder)
    await job.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 300));
    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    return {
      success: true,
      data: {
        strategy,
        tenantId,
        itemsCached: 100,
      },
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Start workers for all queues
 */
export function startWorkers(): void {
  console.log('Starting worker queue processors...');

  // Audio processing worker
  new Worker(
    'audio-processing',
    async (job) => {
      const result = await processAudio(job);
      await logJobCompletion(job, result);
      return result;
    },
    {
      connection,
      concurrency: 5,
    }
  );

  // Dataset indexing worker
  new Worker(
    'dataset-indexing',
    async (job) => {
      const result = await indexDataset(job);
      await logJobCompletion(job, result);
      return result;
    },
    {
      connection,
      concurrency: 3,
    }
  );

  // Compliance check worker
  new Worker(
    'compliance-check',
    async (job) => {
      const result = await runComplianceCheck(job);
      await logJobCompletion(job, result);
      return result;
    },
    {
      connection,
      concurrency: 2,
    }
  );

  // Audit export worker
  new Worker(
    'audit-export',
    async (job) => {
      const result = await generateAuditExport(job);
      await logJobCompletion(job, result);
      return result;
    },
    {
      connection,
      concurrency: 2,
    }
  );

  // Evidence generation worker
  new Worker(
    'evidence-generation',
    async (job) => {
      const result = await generateEvidence(job);
      await logJobCompletion(job, result);
      return result;
    },
    {
      connection,
      concurrency: 3,
    }
  );

  // Webhook delivery worker
  new Worker(
    'webhook-delivery',
    async (job) => {
      const result = await deliverWebhook(job);
      await logJobCompletion(job, result);
      return result;
    },
    {
      connection,
      concurrency: 10,
    }
  );

  // Email send worker
  new Worker(
    'email-send',
    async (job) => {
      const result = await sendEmailJob(job);
      await logJobCompletion(job, result);
      return result;
    },
    {
      connection,
      concurrency: 5,
    }
  );

  // Cache warming worker
  new Worker(
    'cache-warming',
    async (job) => {
      const result = await warmCache(job);
      await logJobCompletion(job, result);
      return result;
    },
    {
      connection,
      concurrency: 2,
    }
  );

  console.log('✅ All workers started');
}

/**
 * Log job completion
 */
async function logJobCompletion(job: Job, result: JobResult): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: result.success ? 'JOB_COMPLETED' : 'JOB_FAILED',
      resourceType: 'worker_job',
      resourceId: job.id,
      metadata: JSON.stringify({
        type: job.name,
        duration: result.duration,
        attempts: job.attemptsMade,
        result: result.data,
        error: result.error,
      }),
      status: result.success ? 'SUCCESS' : 'FAILED',
      timestamp: new Date(),
    },
  }).catch(() => {});
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string, queueName: keyof typeof queues): Promise<any> {
  const queue = queues[queueName];
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    progress: await job.progress,
    state: await job.getState(),
    attemptsMade: job.attemptsMade,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  };
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: keyof typeof queues): Promise<any> {
  const queue = queues[queueName];

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    queueName,
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats(): Promise<any[]> {
  const stats = await Promise.all(
    Object.keys(queues).map((name) =>
      getQueueStats(name as keyof typeof queues)
    )
  );

  return stats;
}
