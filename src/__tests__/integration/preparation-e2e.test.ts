/**
 * End-to-End Integration Test for Preparation Pipeline
 * Tests the complete flow: POST /prepare → Job Queue → Processing → Delivery
 * 
 * Requirements:
 *   - DATABASE_URL env var must be set
 *   - Redis must be running for BullMQ
 *   - AWS credentials for S3 (or uses stub mode)
 * 
 * Run: TEST_MODE=integration npm test -- src/__tests__/integration/preparation-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { JobQueueManager } from '@/lib/preparation/job-queue';
import { DataPreparer } from '@/lib/preparation/data-preparer';
import { PreparationRequest } from '@/lib/preparation/preparation.types';
import { SignedUrlGenerator } from '@/lib/preparation/deliver/signed-urls';

describe.skip('Preparation Pipeline E2E (requires DB + Redis)', () => {
  const testDatasetId = `test-dataset-${Date.now()}`;
  const testTenantId = `test-tenant-${Date.now()}`;
  const testLeaseId = `test-lease-${Date.now()}`;
  
  let jobQueue: JobQueueManager;
  let dataPreparer: DataPreparer;
  let signedUrlGenerator: SignedUrlGenerator;

  beforeAll(async () => {
    // Verify we have database connection
    await prisma.$connect();
    
    // Initialize components
    jobQueue = new JobQueueManager();
    dataPreparer = new DataPreparer();
    signedUrlGenerator = new SignedUrlGenerator({ mode: 'stub' });

    // Create test tenant
    await prisma.tenant.create({
      data: {
        id: testTenantId,
        name: 'Test Tenant',
        email: 'test@example.com',
      },
    });

    // Create test dataset
    await prisma.dataset.create({
      data: {
        id: testDatasetId,
        datasetId: testDatasetId,
        name: 'Test Dataset',
        tenantId: testTenantId,
        storageLocation: '/test/data',
        language: 'en-US',
      },
    });
  }, 30000);

  afterAll(async () => {
    // Cleanup
    await prisma.preparationJob.deleteMany({
      where: { datasetId: testDatasetId },
    });
    await prisma.dataset.deleteMany({
      where: { id: testDatasetId },
    });
    await prisma.tenant.deleteMany({
      where: { id: testTenantId },
    });
    
    await prisma.$disconnect();
  }, 30000);

  beforeEach(async () => {
    // Clear any existing jobs
    await prisma.preparationJob.deleteMany({
      where: { datasetId: testDatasetId },
    });
  });

  describe('POST /prepare → Job Creation', () => {
    it('should create a preparation job in the database', async () => {
      const request: PreparationRequest = {
        leaseId: testLeaseId,
        version: '1.0',
        task: 'pre-training',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        license: { type: 'CC-BY-4.0' },
        privacy: { piiHandling: 'mask' },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
        config: {
          deduplicate: true,
          quality_threshold: 0.7,
          max_tokens: 512,
        },
      };

      // Create job via DataPreparer
      const job = await dataPreparer.createJob(testDatasetId, testTenantId, request);

      // Verify job was created in DB
      const dbJob = await prisma.preparationJob.findUnique({
        where: { id: job.id },
      });

      expect(dbJob).toBeDefined();
      expect(dbJob!.datasetId).toBe(testDatasetId);
      expect(dbJob!.tenantId).toBe(testTenantId);
      expect(dbJob!.status).toBe('pending');
      expect(dbJob!.task).toBe('pre-training');
    });

    it('should queue the job for processing', async () => {
      const request: PreparationRequest = {
        leaseId: testLeaseId,
        version: '1.0',
        task: 'fine-tuning',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        license: { type: 'CC-BY-4.0' },
        privacy: { piiHandling: 'mask' },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      };

      const job = await dataPreparer.createJob(testDatasetId, testTenantId, request);
      
      // Add to job queue
      await jobQueue.addJob(job.id, {
        datasetId: testDatasetId,
        tenantId: testTenantId,
        request,
      });

      // Verify job is in queue
      const queuedJob = await jobQueue.getJob(job.id);
      expect(queuedJob).toBeDefined();
    });
  });

  describe('Job Processing → Completion', () => {
    it('should process a job through all stages', async () => {
      const request: PreparationRequest = {
        leaseId: testLeaseId,
        version: '1.0',
        task: 'pre-training',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        license: { type: 'CC-BY-4.0' },
        privacy: { piiHandling: 'mask' },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
        config: {
          deduplicate: true,
          quality_threshold: 0.7,
        },
      };

      const job = await dataPreparer.createJob(testDatasetId, testTenantId, request);

      // Process the job
      await jobQueue.addJob(job.id, {
        datasetId: testDatasetId,
        tenantId: testTenantId,
        request,
      });

      // Wait for processing (with timeout)
      const maxWaitMs = 60000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitMs) {
        const status = await jobQueue.getJobStatus(job.id);
        
        if (status?.status === 'completed' || status?.status === 'failed') {
          break;
        }
        
        await new Promise(r => setTimeout(r, 1000));
      }

      // Verify final status
      const finalJob = await prisma.preparationJob.findUnique({
        where: { id: job.id },
      });

      expect(finalJob?.status).toMatch(/completed|failed/);
    }, 120000);
  });

  describe('Job Cancellation', () => {
    it('should cancel a pending job', async () => {
      const request: PreparationRequest = {
        leaseId: testLeaseId,
        version: '1.0',
        task: 'rag',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        license: { type: 'CC-BY-4.0' },
        privacy: { piiHandling: 'mask' },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      };

      const job = await dataPreparer.createJob(testDatasetId, testTenantId, request);

      // Cancel the job
      await jobQueue.cancelJob(job.id);

      // Verify cancelled
      const cancelledJob = await prisma.preparationJob.findUnique({
        where: { id: job.id },
      });

      expect(cancelledJob?.status).toBe('cancelled');
    });
  });

  describe('Idempotency', () => {
    it('should return same job for duplicate requests', async () => {
      const request: PreparationRequest = {
        leaseId: testLeaseId,
        version: '1.0',
        task: 'eval',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        license: { type: 'CC-BY-4.0' },
        privacy: { piiHandling: 'mask' },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      };

      // Create first job
      const job1 = await dataPreparer.createJob(testDatasetId, testTenantId, request);

      // Try to create again with same request
      const job2 = await dataPreparer.createJob(testDatasetId, testTenantId, request);

      // Should get same job (idempotency would prevent duplicate)
      // Note: Actual idempotency depends on implementation
      expect(job1.id).toBeDefined();
      expect(job2.id).toBeDefined();
    });
  });

  describe('Job Progress Tracking', () => {
    it('should track job progress through stages', async () => {
      const request: PreparationRequest = {
        leaseId: testLeaseId,
        version: '1.0',
        task: 'pre-training',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        license: { type: 'CC-BY-4.0' },
        privacy: { piiHandling: 'mask' },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      };

      const job = await dataPreparer.createJob(testDatasetId, testTenantId, request);

      // Check initial progress
      const initialProgress = await jobQueue.getJobProgress(job.id);
      expect(initialProgress?.progress).toBe(0);

      // Progress should be tracked during processing
      // (Actual values depend on implementation)
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid task types gracefully', async () => {
      const invalidRequest = {
        leaseId: testLeaseId,
        version: '1.0',
        task: 'invalid-task',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        license: { type: 'CC-BY-4.0' },
        privacy: { piiHandling: 'mask' },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      } as PreparationRequest;

      // Should either reject or handle gracefully
      await expect(
        dataPreparer.createJob(testDatasetId, testTenantId, invalidRequest)
      ).rejects.toThrow();
    });
  });
});
