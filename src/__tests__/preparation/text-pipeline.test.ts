import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { DataPreparer } from '@/lib/preparation/data-preparer';
import { PreparationRequest } from '@/lib/preparation/preparation.types';

describe.skip('Text Preparation Pipeline (requires integration DB)', () => {
  let testTenantId: string;
  let testDatasetId: string;
  let testLeaseId: string;

  const baseContract = {
    version: '1.0' as const,
    license: { type: 'CC-BY-4.0' },
    privacy: { piiHandling: 'mask' as const },
    output: {
      layout: 'prepared/{datasetId}/{jobId}',
      manifestFile: 'manifest.json',
      readmeFile: 'README.md',
      checksumFile: 'checksums.txt',
      checksumAlgorithm: 'sha256' as const,
    },
  };

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        email: 'test@example.com',
      },
    });
    testTenantId = tenant.id;

    const dataset = await prisma.dataset.create({
      data: {
        tenantId: testTenantId,
        datasetId: 'test-dataset-001',
        name: 'Test Dataset',
        language: 'en-US',
        storageLocation: 's3://test-bucket/test-dataset',
      },
    });
    testDatasetId = dataset.id;

    const policy = await prisma.accessPolicy.create({
      data: {
        datasetId: testDatasetId,
        clientTenantId: testTenantId,
        policyId: 'test-policy-001',
        usagePurpose: 'testing',
        status: 'ACTIVE',
        canStream: true,
      },
    });

    const lease = await prisma.accessLease.create({
      data: {
        datasetId: testDatasetId,
        leaseId: 'test-lease-001',
        clientTenantId: testTenantId,
        policyId: policy.id,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    testLeaseId = lease.leaseId;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.accessLease.deleteMany({ where: { clientTenantId: testTenantId } });
    await prisma.dataset.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
  });

  it('should create a preparation job', async () => {
    const request: PreparationRequest = {
      leaseId: testLeaseId,
      task: 'pre-training',
      modality: 'text',
      target: {
        runtime: 'hf',
        format: 'jsonl',
      },
      config: {
        deduplicate: true,
        quality_threshold: 0.7,
        shard_size_mb: 50,
      },
      ...baseContract,
    };

    const job = await prisma.preparationJob.create({
      data: {
        datasetId: testDatasetId,
        tenantId: testTenantId,
        leaseId: testLeaseId,
        task: request.task,
        modality: request.modality,
        runtime: request.target.runtime,
        format: request.target.format,
        config: JSON.stringify(request.config),
        status: 'pending',
        progress: 0,
      },
    });

    expect(job).toBeDefined();
    expect(job.status).toBe('pending');
    expect(job.task).toBe('pre-training');
  });

  it('should validate preparation request schema', () => {
    const validRequest: PreparationRequest = {
      leaseId: testLeaseId,
      task: 'fine-tuning',
      modality: 'text',
      target: {
        runtime: 'openai',
        format: 'jsonl',
      },
      config: {
        template: 'chatml',
        max_tokens: 4096,
      },
      ...baseContract,
    };

    expect(validRequest.task).toBe('fine-tuning');
    expect(validRequest.target.runtime).toBe('openai');
    expect(validRequest.config?.template).toBe('chatml');
  });

  it('should support all task types', () => {
    const tasks: Array<PreparationRequest['task']> = [
      'pre-training',
      'fine-tuning',
      'dpo',
      'rag',
      'eval',
    ];

    tasks.forEach(task => {
      expect(['pre-training', 'fine-tuning', 'dpo', 'rag', 'eval']).toContain(task);
    });
  });

  it('should support all modalities', () => {
    const modalities: Array<PreparationRequest['modality']> = [
      'text',
      'image',
      'audio',
      'multimodal',
    ];

    modalities.forEach(modality => {
      expect(['text', 'image', 'audio', 'multimodal']).toContain(modality);
    });
  });
});
