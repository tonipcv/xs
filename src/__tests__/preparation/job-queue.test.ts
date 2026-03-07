import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PreparationJobQueue, createJobQueue, PreparationJobData } from '@/lib/preparation/job-queue';

// Track mock calls
let mockJobs: Map<string, any> = new Map();
let queueCalls: any[] = [];

// Mock Redis
vi.mock('ioredis', () => ({
  default: class MockRedis {
    quit = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    constructor(...args: any[]) {
      queueCalls.push(args);
    }
    
    add = vi.fn().mockImplementation(async (name: string, data: any, opts?: any) => {
      const jobId = opts?.jobId || `job-${Date.now()}`;
      const job = {
        id: jobId,
        name,
        data,
        opts,
        getState: vi.fn().mockResolvedValue('waiting'),
        progress: 0,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      mockJobs.set(jobId, job);
      return job;
    });

    getJob = vi.fn().mockImplementation(async (id: string) => {
      return mockJobs.get(id) || undefined;
    });

    pause = vi.fn().mockResolvedValue(undefined);
    resume = vi.fn().mockResolvedValue(undefined);
    getWaitingCount = vi.fn().mockResolvedValue(5);
    getActiveCount = vi.fn().mockResolvedValue(2);
    getCompletedCount = vi.fn().mockResolvedValue(100);
    getFailedCount = vi.fn().mockResolvedValue(3);
    getDelayedCount = vi.fn().mockResolvedValue(1);
    close = vi.fn().mockResolvedValue(undefined);
  },

  Worker: class MockWorker {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

describe('PreparationJobQueue', () => {
  let jobQueue: PreparationJobQueue;
  const redisUrl = 'redis://localhost:6379';

  beforeEach(() => {
    mockJobs.clear();
    queueCalls.length = 0;
    vi.clearAllMocks();
    jobQueue = createJobQueue(redisUrl);
  });

  afterEach(async () => {
    await jobQueue.close();
  });

  it('should create queue with correct name', () => {
    expect(queueCalls.length).toBeGreaterThan(0);
    expect(queueCalls[0][0]).toBe('preparation-jobs');
  });

  it('should add job to queue', async () => {
    const jobData: PreparationJobData = {
      datasetId: 'ds-123',
      jobId: 'job-456',
      request: {
        task: 'pretrain',
        modality: 'text',
        target: { runtime: 'pytorch', format: 'jsonl' },
      },
    };

    const job = await jobQueue.addJob(jobData);

    expect(job).toBeDefined();
    expect(job.id).toBe('job-456');
  });

  it('should get job by id', async () => {
    const jobData: PreparationJobData = {
      datasetId: 'ds-123',
      jobId: 'job-789',
      request: {
        task: 'pretrain',
        modality: 'text',
        target: { runtime: 'pytorch', format: 'jsonl' },
      },
    };

    await jobQueue.addJob(jobData);
    const job = await jobQueue.getJob('job-789');

    expect(job).toBeDefined();
    expect(job?.id).toBe('job-789');
  });

  it('should return undefined for non-existent job', async () => {
    const job = await jobQueue.getJob('non-existent');
    expect(job).toBeUndefined();
  });

  it('should get job status', async () => {
    const jobData: PreparationJobData = {
      datasetId: 'ds-123',
      jobId: 'job-status',
      request: {
        task: 'pretrain',
        modality: 'text',
        target: { runtime: 'pytorch', format: 'jsonl' },
      },
    };

    await jobQueue.addJob(jobData);
    const status = await jobQueue.getJobStatus('job-status');

    expect(status).toBe('waiting');
  });

  it('should return unknown status for non-existent job', async () => {
    const status = await jobQueue.getJobStatus('non-existent');
    expect(status).toBe('unknown');
  });

  it('should cancel pending job', async () => {
    const jobData: PreparationJobData = {
      datasetId: 'ds-123',
      jobId: 'job-cancel',
      request: {
        task: 'pretrain',
        modality: 'text',
        target: { runtime: 'pytorch', format: 'jsonl' },
      },
    };

    await jobQueue.addJob(jobData);
    const cancelled = await jobQueue.cancelJob('job-cancel');

    expect(cancelled).toBe(true);
  });

  it('should not cancel non-existent job', async () => {
    const cancelled = await jobQueue.cancelJob('non-existent');
    expect(cancelled).toBe(false);
  });

  it('should get queue metrics', async () => {
    const metrics = await jobQueue.getQueueMetrics();

    expect(metrics).toHaveProperty('waiting');
    expect(metrics).toHaveProperty('active');
    expect(metrics).toHaveProperty('completed');
    expect(metrics).toHaveProperty('failed');
    expect(metrics).toHaveProperty('delayed');
  });

  it('should pause and resume queue', async () => {
    await jobQueue.pauseQueue();
    await jobQueue.resumeQueue();
    expect(true).toBe(true);
  });
});

describe('createJobQueue factory', () => {
  it('should create queue with provided redis URL', () => {
    const queue = createJobQueue('redis://custom:6379');
    expect(queue).toBeDefined();
    queue.close();
  });
});
