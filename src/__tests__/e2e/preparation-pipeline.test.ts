import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { DataPreparer } from '@/lib/preparation/data-preparer';
import { PreparationJob } from '@/lib/preparation/preparation.types';

describe('Data Preparation Pipeline E2E', () => {
  let testTenantId: string;
  let testDatasetId: string;
  let testDataSourceId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'E2E Test Tenant',
        email: 'e2e@test.com',
      },
    });
    testTenantId = tenant.id;

    await prisma.creditLedger.create({
      data: {
        tenantId: testTenantId,
        amount: 100.0,
        eventType: 'credit',
        balanceAfter: 100.0,
        description: 'Initial credits for testing',
      },
    });

    const dataset = await prisma.dataset.create({
      data: {
        tenantId: testTenantId,
        datasetId: 'e2e-test-001',
        name: 'E2E Test Dataset',
        language: 'en-US',
        storageLocation: 's3://test-bucket/e2e-test',
      },
    });
    testDatasetId = dataset.id;

    const dataSource = await prisma.dataSource.create({
      data: {
        dataSourceId: 'test-source-001',
        datasetId: testDatasetId,
        cloudIntegrationId: 'test-integration',
        storageLocation: 's3://test-bucket',
        name: 'Test Source',
        status: 'ACTIVE',
      },
    });
    testDataSourceId = dataSource.id;

    const sampleTexts = [
      'This is a sample medical record for patient John Doe.',
      'Patient email: john.doe@example.com, phone: 555-1234.',
      'Treatment plan includes medication and follow-up visits.',
      'Lab results show normal values across all tests.',
      'Patient reported improvement in symptoms after treatment.',
    ];

    for (let i = 0; i < sampleTexts.length; i++) {
      await prisma.dataAsset.create({
        data: {
          datasetId: testDatasetId,
          dataSourceId: testDataSourceId,
          segmentId: `seg-${i}`,
          fileKey: `test-data/sample-${i}.txt`,
          durationSec: 0,
          sampleRate: 0,
          codec: 'text',
          channelCount: 1,
          language: 'en-US',
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.dataAsset.deleteMany({ where: { datasetId: testDatasetId } });
    await prisma.dataSource.deleteMany({ where: { id: testDataSourceId } });
    await prisma.dataset.deleteMany({ where: { id: testDatasetId } });
    await prisma.creditLedger.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
  });

  it('should complete full preparation pipeline for text pre-training', async () => {
    const preparer = new DataPreparer();

    const job: PreparationJob = {
      id: 'test-job-001',
      datasetId: testDatasetId,
      tenantId: testTenantId,
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      request: {
        leaseId: 'test-lease-001',
        version: '1.0',
        task: 'pre-training',
        modality: 'text',
        target: {
          runtime: 'hf',
          format: 'jsonl',
        },
        config: {
          deduplicate: true,
          quality_threshold: 0.5,
          deid: false,
          shard_size_mb: 10,
          seed: 42,
        },
        license: {
          type: 'research',
        },
        privacy: {
          piiHandling: 'retain',
        },
        output: {
          layout: 'standard',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      },
    };

    const result = await preparer.prepare(job);

    expect(result).toBeDefined();
    expect(result.jobId).toBe('test-job-001');
    expect(result.normalization).toBeDefined();
    expect(result.normalization.recordsProcessed).toBeGreaterThan(0);
    expect(result.compilation).toBeDefined();
    expect(result.compilation.shardCount).toBeGreaterThan(0);
    expect(result.delivery).toBeDefined();
  }, 60000);

  it('should apply de-identification when configured', async () => {
    const preparer = new DataPreparer();

    const job: PreparationJob = {
      id: 'test-job-002',
      datasetId: testDatasetId,
      tenantId: testTenantId,
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      request: {
        leaseId: 'test-lease-002',
        version: '1.0',
        task: 'fine-tuning',
        modality: 'text',
        target: {
          runtime: 'openai',
          format: 'jsonl',
        },
        config: {
          deid: true,
          template: 'chatml',
        },
        license: {
          type: 'research',
        },
        privacy: {
          piiHandling: 'mask',
        },
        output: {
          layout: 'standard',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      },
    };

    const result = await preparer.prepare(job);

    expect(result.normalization.deidApplied).toBe(true);
  }, 60000);

  it('should record billing metrics after job completion', async () => {
    const initialBalance = await prisma.creditLedger.findMany({
      where: { tenantId: testTenantId },
    });

    const initialTotal = initialBalance.reduce((sum, entry) => sum + Number(entry.amount), 0);

    const preparer = new DataPreparer();

    const job: PreparationJob = {
      id: 'test-job-003',
      datasetId: testDatasetId,
      tenantId: testTenantId,
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      request: {
        leaseId: 'test-lease-003',
        version: '1.0',
        task: 'rag',
        modality: 'text',
        target: {
          runtime: 'generic',
          format: 'jsonl',
        },
        config: {
          chunk_size: 256,
          chunk_overlap: 25,
        },
        license: {
          type: 'research',
        },
        privacy: {
          piiHandling: 'retain',
        },
        output: {
          layout: 'standard',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      },
    };

    await preparer.prepare(job);

    const finalBalance = await prisma.creditLedger.findMany({
      where: { tenantId: testTenantId },
    });

    const finalTotal = finalBalance.reduce((sum, entry) => sum + Number(entry.amount), 0);

    expect(finalTotal).toBeLessThan(initialTotal);
    expect(finalBalance.length).toBeGreaterThan(initialBalance.length);
  }, 60000);
});
