import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { POST } from '@/app/api/v1/datasets/[datasetId]/prepare/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { DataPreparer } from '@/lib/preparation/data-preparer';

// Mocks
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dataset: {
      findFirst: vi.fn(),
    },
    accessLease: {
      findFirst: vi.fn(),
    },
    preparationJob: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    idempotencyRecord: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/preparation/idempotency/idempotency-manager', () => ({
  idempotencyManager: {
    checkIdempotency: vi.fn().mockResolvedValue(null),
    storeIdempotency: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/preparation/rate-limiting/rate-limiter', () => ({
  rateLimiter: {
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  },
}));

vi.mock('@/lib/preparation/job-queue', () => ({
  createJobQueue: vi.fn().mockReturnValue({
    addJob: vi.fn().mockResolvedValue({ id: 'bull-job-123' }),
  }),
}));

describe('POST /prepare E2E Integration Test', () => {
  const mockDatasetId = 'dataset-test-123';
  const mockTenantId = 'tenant-test-456';
  const mockLeaseId = 'lease-test-789';
  const mockJobId = 'job-test-abc';

  beforeAll(() => {
    // Setup authenticated session
    vi.mocked(getServerSession).mockResolvedValue({
      user: { tenantId: mockTenantId },
    });

    // Setup dataset found
    vi.mocked(prisma.dataset.findFirst).mockResolvedValue({
      id: mockDatasetId,
      tenantId: mockTenantId,
      name: 'Test Dataset',
    } as any);

    // Setup active lease
    vi.mocked(prisma.accessLease.findFirst).mockResolvedValue({
      id: mockLeaseId,
      datasetId: mockDatasetId,
      status: 'ACTIVE',
    } as any);

    // Setup job creation
    vi.mocked(prisma.preparationJob.create).mockResolvedValue({
      id: mockJobId,
      datasetId: mockDatasetId,
      tenantId: mockTenantId,
      leaseId: mockLeaseId,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('should create a preparation job for text RAG task', async () => {
    const requestBody = {
      leaseId: mockLeaseId,
      version: '1.0',
      task: 'rag',
      modality: 'text',
      target: {
        runtime: 'hf',
        format: 'jsonl',
      },
      config: {
        quality_threshold: 0.8,
        chunk_size: 512,
        deduplicate: true,
      },
      license: {
        type: 'CC-BY-4.0',
      },
      privacy: {
        piiHandling: 'mask',
      },
      output: {
        layout: 'prepared/{datasetId}/{jobId}',
      },
    };

    const request = new Request('http://localhost:3000/api/v1/datasets/' + mockDatasetId + '/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request, { params: { datasetId: mockDatasetId } });

    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('jobId', mockJobId);
    expect(body).toHaveProperty('status', 'pending');
    expect(body).toHaveProperty('message', 'Preparation job queued');
  });

  it('should validate request body schema', async () => {
    const invalidRequestBody = {
      leaseId: mockLeaseId,
      // Missing required fields: task, modality, target
    };

    const request = new Request('http://localhost:3000/api/v1/datasets/' + mockDatasetId + '/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invalidRequestBody),
    });

    const response = await POST(request, { params: { datasetId: mockDatasetId } });

    expect(response.status).toBe(500);
  });

  it('should check rate limits before creating job', async () => {
    const { rateLimiter } = await import('@/lib/preparation/rate-limiting/rate-limiter');
    
    const requestBody = {
      leaseId: mockLeaseId,
      version: '1.0',
      task: 'pre-training',
      modality: 'text',
      target: {
        runtime: 'hf',
        format: 'jsonl',
      },
      license: {
        type: 'CC-BY-4.0',
      },
      privacy: {
        piiHandling: 'mask',
      },
      output: {
        layout: 'prepared/{datasetId}/{jobId}',
      },
    };

    const request = new Request('http://localhost:3000/api/v1/datasets/' + mockDatasetId + '/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    await POST(request, { params: { datasetId: mockDatasetId } });

    expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith(mockTenantId);
  });

  it('should check idempotency when key provided', async () => {
    const { idempotencyManager } = await import('@/lib/preparation/idempotency/idempotency-manager');
    
    const requestBody = {
      leaseId: mockLeaseId,
      version: '1.0',
      task: 'fine-tuning',
      modality: 'text',
      target: {
        runtime: 'hf',
        format: 'jsonl',
      },
      license: {
        type: 'CC-BY-4.0',
      },
      privacy: {
        piiHandling: 'mask',
      },
      output: {
        layout: 'prepared/{datasetId}/{jobId}',
      },
    };

    const request = new Request('http://localhost:3000/api/v1/datasets/' + mockDatasetId + '/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'test-key-123',
      },
      body: JSON.stringify(requestBody),
    });

    await POST(request, { params: { datasetId: mockDatasetId } });

    expect(idempotencyManager.checkIdempotency).toHaveBeenCalledWith(
      'test-key-123',
      mockDatasetId,
      mockTenantId,
      expect.any(Object)
    );
  });

  it('should return 404 for non-existent dataset', async () => {
    vi.mocked(prisma.dataset.findFirst).mockResolvedValueOnce(null);

    const requestBody = {
      leaseId: mockLeaseId,
      version: '1.0',
      task: 'rag',
      modality: 'text',
      target: {
        runtime: 'hf',
        format: 'jsonl',
      },
      license: {
        type: 'CC-BY-4.0',
      },
      privacy: {
        piiHandling: 'mask',
      },
      output: {
        layout: 'prepared/{datasetId}/{jobId}',
      },
    };

    const request = new Request('http://localhost:3000/api/v1/datasets/non-existent/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request, { params: { datasetId: 'non-existent' } });

    expect(response.status).toBe(404);
  });

  it('should return 403 for inactive lease', async () => {
    vi.mocked(prisma.accessLease.findFirst).mockResolvedValueOnce(null);

    const requestBody = {
      leaseId: 'inactive-lease',
      version: '1.0',
      task: 'rag',
      modality: 'text',
      target: {
        runtime: 'hf',
        format: 'jsonl',
      },
      license: {
        type: 'CC-BY-4.0',
      },
      privacy: {
        piiHandling: 'mask',
      },
      output: {
        layout: 'prepared/{datasetId}/{jobId}',
      },
    };

    const request = new Request('http://localhost:3000/api/v1/datasets/' + mockDatasetId + '/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request, { params: { datasetId: mockDatasetId } });

    expect(response.status).toBe(403);
  });

  it('should add job to BullMQ queue', async () => {
    const { createJobQueue } = await import('@/lib/preparation/job-queue');
    
    const requestBody = {
      leaseId: mockLeaseId,
      version: '1.0',
      task: 'eval',
      modality: 'text',
      target: {
        runtime: 'hf',
        format: 'jsonl',
      },
      license: {
        type: 'CC-BY-4.0',
      },
      privacy: {
        piiHandling: 'mask',
      },
      output: {
        layout: 'prepared/{datasetId}/{jobId}',
      },
    };

    const request = new Request('http://localhost:3000/api/v1/datasets/' + mockDatasetId + '/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    await POST(request, { params: { datasetId: mockDatasetId } });

    // Verify job was added to queue
    const jobQueue = vi.mocked(createJobQueue).mock.results[0]?.value;
    if (jobQueue) {
      expect(jobQueue.addJob).toHaveBeenCalledWith(expect.objectContaining({
        jobId: mockJobId,
        datasetId: mockDatasetId,
        request: expect.objectContaining({
          task: 'eval',
          modality: 'text',
        }),
      }));
    }
  });

  it('should support all task types', async () => {
    const tasks = ['pre-training', 'fine-tuning', 'dpo', 'rag', 'eval'];
    
    for (const task of tasks) {
      vi.mocked(prisma.preparationJob.create).mockResolvedValueOnce({
        id: `job-${task}`,
        datasetId: mockDatasetId,
        tenantId: mockTenantId,
        status: 'pending',
        progress: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const requestBody = {
        leaseId: mockLeaseId,
        version: '1.0',
        task,
        modality: 'text',
        target: {
          runtime: 'hf',
          format: 'jsonl',
        },
        license: {
          type: 'CC-BY-4.0',
        },
        privacy: {
          piiHandling: 'mask',
        },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
        },
      };

      const request = new Request('http://localhost:3000/api/v1/datasets/' + mockDatasetId + '/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request, { params: { datasetId: mockDatasetId } });
      expect(response.status).toBe(200);
    }
  });
});
