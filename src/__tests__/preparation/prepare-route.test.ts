import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { POST } from '@/app/api/v1/datasets/[datasetId]/prepare/route';
import { idempotencyManager } from '@/lib/preparation/idempotency/idempotency-manager';
import { rateLimiter } from '@/lib/preparation/rate-limiting/rate-limiter';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

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
    },
    idempotencyRecord: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/preparation/data-preparer', () => ({
  DataPreparer: class MockDataPreparer {
    prepare = vi.fn().mockResolvedValue({
      delivery: {
        manifestPath: '/tmp/test/manifest.json',
        downloadUrls: ['https://example.com/download'],
      },
    });
  },
}));

describe('POST /api/v1/datasets/:datasetId/prepare', () => {
  const mockTenantId = 'tenant-123';
  const mockDatasetId = 'dataset-456';
  const mockLeaseId = 'lease-789';
  const mockJobId = 'job-abc';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock session
    (getServerSession as any).mockResolvedValue({
      user: { tenantId: mockTenantId },
    });

    // Mock dataset exists
    (prisma.dataset.findFirst as any).mockResolvedValue({
      id: mockDatasetId,
      tenantId: mockTenantId,
      name: 'Test Dataset',
    });

    // Mock active lease
    (prisma.accessLease.findFirst as any).mockResolvedValue({
      id: mockLeaseId,
      datasetId: mockDatasetId,
      status: 'ACTIVE',
    });

    // Mock job creation
    (prisma.preparationJob.create as any).mockResolvedValue({
      id: mockJobId,
      datasetId: mockDatasetId,
      tenantId: mockTenantId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockRequest = (body: any, headers?: Record<string, string>) => {
    return new Request('http://localhost/api/v1/datasets/' + mockDatasetId + '/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  };

  const validRequestBody = {
    leaseId: mockLeaseId,
    task: 'rag',
    modality: 'text',
    target: {
      runtime: 'hf',
      format: 'jsonl',
    },
    config: {
      quality_threshold: 0.8,
      chunk_size: 512,
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

  describe('Rate Limiting', () => {
    it('should allow request when under rate limits', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });

      const request = createMockRequest(validRequestBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.jobId).toBe(mockJobId);
      expect(body.status).toBe('pending');
    });

    it('should reject request when rate limit exceeded', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({
        allowed: false,
        reason: 'Hourly rate limit exceeded (100 requests/hour)',
        retryAfter: 3600,
      });

      const request = createMockRequest(validRequestBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe('Rate limit exceeded');
      expect(body.reason).toContain('rate limit');
      expect(body.retryAfter).toBe(3600);
      expect(response.headers.get('Retry-After')).toBe('3600');
    });

    it('should reject request when concurrent jobs limit exceeded', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({
        allowed: false,
        reason: 'Concurrent jobs limit exceeded (5 jobs)',
        retryAfter: 300,
      });

      const request = createMockRequest(validRequestBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.reason).toContain('Concurrent jobs');
    });

    it('should call rate limiter with correct tenant ID', async () => {
      const checkSpy = vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });

      const request = createMockRequest(validRequestBody);
      await POST(request, { params: { datasetId: mockDatasetId } });

      expect(checkSpy).toHaveBeenCalledWith(mockTenantId);
    });
  });

  describe('Idempotency', () => {
    it('should return cached response for duplicate idempotency key', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });
      
      const cachedResponse = {
        jobId: 'cached-job-id',
        status: 'pending',
        message: 'Preparation job started',
      };

      vi.spyOn(idempotencyManager, 'checkIdempotency').mockResolvedValue({
        jobId: 'cached-job-id',
        response: cachedResponse,
      });

      const request = createMockRequest(validRequestBody, {
        'Idempotency-Key': 'same-key-123',
      });
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(cachedResponse);
      
      // Should not create new job
      expect(prisma.preparationJob.create).not.toHaveBeenCalled();
    });

    it('should store idempotency record for new request', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });
      vi.spyOn(idempotencyManager, 'checkIdempotency').mockResolvedValue(null);
      const storeSpy = vi.spyOn(idempotencyManager, 'storeIdempotency').mockResolvedValue();

      const idempotencyKey = 'new-key-456';
      const request = createMockRequest(validRequestBody, {
        'Idempotency-Key': idempotencyKey,
      });
      
      await POST(request, { params: { datasetId: mockDatasetId } });

      expect(storeSpy).toHaveBeenCalledWith(
        idempotencyKey,
        mockDatasetId,
        mockTenantId,
        validRequestBody,
        mockJobId,
        expect.objectContaining({
          jobId: mockJobId,
          status: 'pending',
          message: 'Preparation job started',
        })
      );
    });

    it('should handle idempotency key conflict', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });
      vi.spyOn(idempotencyManager, 'checkIdempotency').mockRejectedValue(
        new Error('Idempotency key conflict: same key used for different request body')
      );

      const request = createMockRequest(validRequestBody, {
        'Idempotency-Key': 'conflicting-key',
      });

      const response = await POST(request, { params: { datasetId: mockDatasetId } });
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Failed to create preparation job');
    });

    it('should work without idempotency key (optional)', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });

      // No idempotency key header
      const request = createMockRequest(validRequestBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(200);
      expect(prisma.preparationJob.create).toHaveBeenCalled();
    });

    it('should call idempotency check with correct parameters', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });
      const checkSpy = vi.spyOn(idempotencyManager, 'checkIdempotency').mockResolvedValue(null);

      const idempotencyKey = 'test-key-789';
      const request = createMockRequest(validRequestBody, {
        'Idempotency-Key': idempotencyKey,
      });

      await POST(request, { params: { datasetId: mockDatasetId } });

      expect(checkSpy).toHaveBeenCalledWith(
        idempotencyKey,
        mockDatasetId,
        mockTenantId,
        validRequestBody
      );
    });
  });

  describe('Request validation', () => {
    it('should reject unauthorized requests', async () => {
      (getServerSession as any).mockResolvedValue(null);

      const request = createMockRequest(validRequestBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject requests for non-existent dataset', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });
      (prisma.dataset.findFirst as any).mockResolvedValue(null);

      const request = createMockRequest(validRequestBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('Dataset not found');
    });

    it('should reject requests without active lease', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });
      (prisma.accessLease.findFirst as any).mockResolvedValue(null);

      const request = createMockRequest(validRequestBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Invalid or inactive lease');
    });

    it('should validate request body schema', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });

      const invalidBody = {
        leaseId: mockLeaseId,
        task: 'invalid-task', // Invalid enum value
        modality: 'text',
        target: {
          runtime: 'hf',
          format: 'jsonl',
        },
        license: { type: 'CC-BY-4.0' },
        privacy: { piiHandling: 'mask' },
        output: { layout: 'prepared/{datasetId}/{jobId}' },
      };

      const request = createMockRequest(invalidBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(500); // Zod validation error
    });

    it('should validate split ratios sum to 1', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });

      const invalidBody = {
        ...validRequestBody,
        config: {
          split_ratios: { train: 0.5, val: 0.3, test: 0.3 }, // Sum = 1.1
        },
      };

      const request = createMockRequest(invalidBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(500); // Zod refinement error
    });
  });

  describe('Job creation', () => {
    it('should create job with correct data', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });

      const request = createMockRequest(validRequestBody);
      await POST(request, { params: { datasetId: mockDatasetId } });

      expect(prisma.preparationJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          datasetId: mockDatasetId,
          tenantId: mockTenantId,
          leaseId: mockLeaseId,
          task: 'rag',
          modality: 'text',
          runtime: 'hf',
          format: 'jsonl',
          status: 'pending',
          progress: 0,
          config: JSON.stringify(validRequestBody.config),
          license: validRequestBody.license,
          privacy: validRequestBody.privacy,
          output: expect.objectContaining({
            layout: 'prepared/{datasetId}/{jobId}',
          }),
        }),
      });
    });

    it('should return job ID and status', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });

      const request = createMockRequest(validRequestBody);
      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        jobId: mockJobId,
        status: 'pending',
        message: 'Preparation job started',
      });
    });
  });

  describe('End-to-end flow', () => {
    it('should handle complete request with rate limiting and idempotency', async () => {
      vi.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({ allowed: true });
      vi.spyOn(idempotencyManager, 'checkIdempotency').mockResolvedValue(null);
      vi.spyOn(idempotencyManager, 'storeIdempotency').mockResolvedValue();

      const idempotencyKey = 'e2e-test-key';
      const request = createMockRequest(validRequestBody, {
        'Idempotency-Key': idempotencyKey,
      });

      const response = await POST(request, { params: { datasetId: mockDatasetId } });

      expect(response.status).toBe(200);
      
      // Verify rate limiter was called
      expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith(mockTenantId);
      
      // Verify idempotency was checked
      expect(idempotencyManager.checkIdempotency).toHaveBeenCalledWith(
        idempotencyKey,
        mockDatasetId,
        mockTenantId,
        validRequestBody
      );
      
      // Verify job was created
      expect(prisma.preparationJob.create).toHaveBeenCalled();
      
      // Verify idempotency was stored
      expect(idempotencyManager.storeIdempotency).toHaveBeenCalled();
    });
  });
});
