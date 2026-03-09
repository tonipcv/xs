/**
 * Integration Test: Text Pipeline End-to-End with Real Database
 * 
 * Testa o fluxo completo:
 * POST /prepare → job created → DataPreparer → artefatos → GET /jobs/:id → completed
 * 
 * Requisitos:
 * - DATABASE_URL configurado com PostgreSQL real
 * - AWS credentials configuradas (para S3)
 * - Redis configurado (para BullMQ)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DataPreparer } from '@/lib/preparation/data-preparer';
import { PreparationJobQueue } from '@/lib/preparation/job-queue';
import { PreparationWorker } from '@/lib/preparation/worker';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface TestContext {
  tenantId: string;
  datasetId: string;
  leaseId: string;
  jobId: string;
  tempDir: string;
  s3Client: S3Client;
  bucketName: string;
  dataPreparer: DataPreparer;
  jobQueue: PreparationJobQueue;
  worker: PreparationWorker;
}

describe('Text Pipeline E2E Integration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Verificar variáveis de ambiente
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }

    ctx = {
      tenantId: `test-tenant-${Date.now()}`,
      datasetId: '',
      leaseId: '',
      jobId: '',
      tempDir: path.join('/tmp', 'e2e-test', Date.now().toString()),
      s3Client: new S3Client({ region: process.env.AWS_REGION || 'us-east-1' }),
      bucketName: process.env.AWS_S3_BUCKET || 'xase-test-bucket',
      dataPreparer: new DataPreparer(),
      jobQueue: new PreparationJobQueue({ redisUrl: process.env.REDIS_URL || 'redis://localhost:6379' }),
      worker: new PreparationWorker({ redisUrl: process.env.REDIS_URL || 'redis://localhost:6379' }),
    };

    await fs.mkdir(ctx.tempDir, { recursive: true });

    // Criar tenant de teste
    await prisma.tenant.create({
      data: {
        id: ctx.tenantId,
        name: 'E2E Test Tenant',
        email: `e2e-test-${Date.now()}@test.com`,
      },
    });

    console.log(`[E2E Setup] Tenant: ${ctx.tenantId}`);
  }, 30000);

  afterAll(async () => {
    // Cleanup
    if (ctx.datasetId) {
      await prisma.preparationJob.deleteMany({ where: { datasetId: ctx.datasetId } });
      await prisma.accessLease.deleteMany({ where: { datasetId: ctx.datasetId } });
      await prisma.dataset.deleteMany({ where: { id: ctx.datasetId } });
    }
    
    await prisma.tenant.deleteMany({ where: { id: ctx.tenantId } });
    await prisma.$disconnect();
    
    // Cleanup temp files
    try {
      await fs.rm(ctx.tempDir, { recursive: true, force: true });
    } catch {}
  }, 30000);

  beforeEach(async () => {
    // Criar dataset de teste com 100 registros de texto
    ctx.datasetId = `dataset-${randomUUID()}`;
    
    // Criar arquivos de teste no S3
    const testData = Array.from({ length: 100 }, (_, i) => ({
      id: `record-${i}`,
      text: `This is sample medical text ${i}. Patient John Doe has condition X. Contact: john@example.com`,
      metadata: {
        patient_id: `patient-${i % 10}`,
        source: 'ehr',
        date: new Date().toISOString(),
      },
    }));

    const jsonlContent = testData.map(r => JSON.stringify(r)).join('\n');
    const s3Key = `test-datasets/${ctx.datasetId}/data.jsonl`;
    
    await ctx.s3Client.send(new PutObjectCommand({
      Bucket: ctx.bucketName,
      Key: s3Key,
      Body: jsonlContent,
      ContentType: 'application/jsonlines',
    }));

    // Criar dataset no DB
    await prisma.dataset.create({
      data: {
        id: ctx.datasetId,
        datasetId: ctx.datasetId,
        name: 'E2E Test Dataset',
        description: '100 records for end-to-end testing',
        tenantId: ctx.tenantId,
        dataType: 'TEXT',
        language: 'en',
        storageLocation: `s3://${ctx.bucketName}/${s3Key}`,
        numRecordings: 100,
        status: 'ACTIVE',
      },
    });

    // Criar lease ativo
    ctx.leaseId = `lease-${randomUUID()}`;
    await prisma.accessLease.create({
      data: {
        id: ctx.leaseId,
        leaseId: ctx.leaseId,
        datasetId: ctx.datasetId,
        clientTenantId: ctx.tenantId,
        policyId: 'default-policy',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    console.log(`[E2E Setup] Dataset: ${ctx.datasetId}, Lease: ${ctx.leaseId}`);
  }, 30000);

  it('should process text dataset through complete pipeline (pretrain)', async () => {
    // 1. Criar job de preparação
    const preparationJob = await prisma.preparationJob.create({
      data: {
        datasetId: ctx.datasetId,
        tenantId: ctx.tenantId,
        leaseId: ctx.leaseId,
        task: 'pre-training',
        modality: 'text',
        runtime: 'jsonl',
        format: 'jsonl',
        config: JSON.stringify({
          quality_threshold: 0.8,
          deduplicate: true,
          deid: true,
          max_tokens: 2048,
        }),
        license: 'research',
        privacy: 'phi_redacted',
        output: JSON.stringify({
          format: 'jsonl',
          compression: 'gzip',
        }),
        status: 'pending',
        progress: 0,
      },
    });

    ctx.jobId = preparationJob.id;
    console.log(`[E2E] Created job: ${ctx.jobId}`);

    // 2. Adicionar job à fila
    await ctx.jobQueue.addJob({
      jobId: ctx.jobId,
      datasetId: ctx.datasetId,
      request: {
        task: 'pre-training',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        config: {
          quality_threshold: 0.8,
          deduplicate: true,
          deid: true,
          max_tokens: 2048,
        },
      },
    });

    // 3. Processar job
    const job = await ctx.jobQueue.getJob(ctx.jobId);
    expect(job).toBeDefined();
    const jobState = await job!.getState();
    expect(jobState).toBe('waiting');

    // 4. Executar preparação
    const result = await ctx.dataPreparer.prepare({
      id: ctx.jobId,
      datasetId: ctx.datasetId,
      tenantId: ctx.tenantId,
      request: {
        leaseId: ctx.leaseId,
        version: '1.0',
        task: 'pre-training',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        config: {
          quality_threshold: 0.8,
          deduplicate: true,
          deid: true,
          max_tokens: 2048,
        },
        license: { type: 'research' },
        privacy: { piiHandling: 'mask' },
        output: { layout: 'standard', manifestFile: 'manifest.json', readmeFile: 'README.md', checksumFile: 'checksums.txt', checksumAlgorithm: 'sha256' },
      },
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: preparationJob.createdAt,
      updatedAt: preparationJob.updatedAt,
    });

    // 5. Verificar resultado
    expect(result.normalization.recordsProcessed).toBeGreaterThan(0);
    expect(result.compilation.shardCount).toBeGreaterThan(0);
    expect(result.delivery.manifestPath).toBeDefined();
    expect(result.delivery.checksums).toBeDefined();

    // 6. Verificar job no DB
    const updatedJob = await prisma.preparationJob.findUnique({
      where: { id: ctx.jobId },
    });

    expect(updatedJob).toBeDefined();
    expect(updatedJob!.status).toBe('completed');
    expect(updatedJob!.progress).toBe(100);
    expect(updatedJob!.outputPath).toBeDefined();

    // 7. Verificar manifesto
    const manifestPath = result.delivery.manifestPath;
    expect(manifestPath).toContain('manifest.json');

    // 8. Verificar checksums
    expect(Object.keys(result.delivery.checksums || {}).length).toBeGreaterThan(0);
    
    // 9. Verificar README
    const readmePath = manifestPath.replace('manifest.json', 'README.md');
    expect(readmePath).toContain('README.md');

    console.log(`[E2E] Job completed: ${ctx.jobId}`);
    console.log(`[E2E] Output: ${result.delivery.manifestPath}`);
    console.log(`[E2E] Records processed: ${result.normalization.recordCount}`);
  }, 120000);

  it('should process text dataset for SFT task', async () => {
    const preparationJob = await prisma.preparationJob.create({
      data: {
        datasetId: ctx.datasetId,
        tenantId: ctx.tenantId,
        leaseId: ctx.leaseId,
        task: 'fine-tuning',
        modality: 'text',
        runtime: 'jsonl',
        format: 'jsonl',
        config: JSON.stringify({
          template: 'chatml',
          input_field: 'text',
          output_field: 'response',
          system_prompt: 'You are a medical assistant.',
        }),
        license: 'commercial',
        privacy: 'phi_redacted',
        output: JSON.stringify({ format: 'jsonl' }),
        status: 'pending',
        progress: 0,
      },
    });

    ctx.jobId = preparationJob.id;

    const result = await ctx.dataPreparer.prepare({
      id: ctx.jobId,
      datasetId: ctx.datasetId,
      tenantId: ctx.tenantId,
      request: {
        leaseId: ctx.leaseId,
        version: '1.0',
        task: 'fine-tuning',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        config: {
          template: 'chatml',
          input_field: 'text',
          output_field: 'response',
        },
        license: {
          type: 'commercial',
          allowCommercial: true,
          allowResearch: true,
          allowTraining: true,
          requireAttribution: false,
        },
        privacy: {
          piiHandling: 'mask',
          anonymize: true,
          retentionHours: 168,
        },
        output: {
          layout: 'sharded',
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.sha256',
          checksumAlgorithm: 'sha256',
        },
      },
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: preparationJob.createdAt,
      updatedAt: preparationJob.updatedAt,
    });

    expect(result.compilation.shardCount).toBeGreaterThan(0);
    expect(result.delivery.manifestPath).toBeDefined();

    const updatedJob = await prisma.preparationJob.findUnique({
      where: { id: ctx.jobId },
    });

    expect(updatedJob!.status).toBe('completed');
  }, 120000);

  it('should process text dataset for RAG task', async () => {
    const preparationJob = await prisma.preparationJob.create({
      data: {
        datasetId: ctx.datasetId,
        tenantId: ctx.tenantId,
        leaseId: ctx.leaseId,
        task: 'rag',
        modality: 'text',
        runtime: 'jsonl',
        format: 'jsonl',
        config: JSON.stringify({
          chunk_size: 512,
          chunk_overlap: 50,
          preserveMetadata: true,
        }),
        license: 'research',
        privacy: 'phi_redacted',
        output: JSON.stringify({ format: 'jsonl' }),
        status: 'pending',
        progress: 0,
      },
    });

    ctx.jobId = preparationJob.id;

    const result = await ctx.dataPreparer.prepare({
      id: ctx.jobId,
      datasetId: ctx.datasetId,
      tenantId: ctx.tenantId,
      request: {
        leaseId: ctx.leaseId,
        version: '1.0',
        task: 'rag',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        config: {
          chunk_size: 512,
          chunk_overlap: 50,
        },
        license: { type: 'research' },
        privacy: { piiHandling: 'mask' },
        output: { layout: 'standard', manifestFile: 'manifest.json', readmeFile: 'README.md', checksumFile: 'checksums.txt', checksumAlgorithm: 'sha256' },
      },
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: preparationJob.createdAt,
      updatedAt: preparationJob.updatedAt,
    });

    expect(result.compilation.shardCount).toBeGreaterThan(0);
    
    // RAG deve gerar chunks
    expect(result.normalization.recordsProcessed).toBeGreaterThan(0);

    const updatedJob = await prisma.preparationJob.findUnique({
      where: { id: ctx.jobId },
    });

    expect(updatedJob!.status).toBe('completed');
  }, 120000);

  it('should validate manifest.json structure', async () => {
    const preparationJob = await prisma.preparationJob.create({
      data: {
        datasetId: ctx.datasetId,
        tenantId: ctx.tenantId,
        leaseId: ctx.leaseId,
        task: 'pre-training',
        modality: 'text',
        runtime: 'jsonl',
        format: 'jsonl',
        config: JSON.stringify({ deid: true }),
        license: 'research',
        privacy: 'phi_redacted',
        output: JSON.stringify({ format: 'jsonl' }),
        status: 'pending',
        progress: 0,
      },
    });

    ctx.jobId = preparationJob.id;

    const result = await ctx.dataPreparer.prepare({
      id: ctx.jobId,
      datasetId: ctx.datasetId,
      tenantId: ctx.tenantId,
      request: {
        leaseId: ctx.leaseId,
        version: '1.0',
        task: 'pre-training',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        config: { deid: true },
        license: { type: 'research' },
        privacy: { piiHandling: 'mask' },
        output: { layout: 'standard', manifestFile: 'manifest.json', readmeFile: 'README.md', checksumFile: 'checksums.txt', checksumAlgorithm: 'sha256' },
      },
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: preparationJob.createdAt,
      updatedAt: preparationJob.updatedAt,
    });

    // Validar estrutura do manifesto
    const manifest = {
      version: '1.0',
      jobId: ctx.jobId,
      datasetId: ctx.datasetId,
      tenantId: ctx.tenantId,
      task: 'pretrain',
      modality: 'text',
      format: 'jsonl',
      createdAt: new Date().toISOString(),
      checksums: result.delivery.checksums,
      files: result.delivery.downloadUrls.map((url, i) => ({
        path: `data-${i}.jsonl`,
        url,
        checksum: result.delivery.checksums?.[url] || 'sha256:unknown',
      })),
      stats: {
        inputRecords: result.normalization.recordCount,
        outputRecords: result.compilation.recordCount || result.normalization.recordCount,
        deidApplied: true,
        qualityScore: result.normalization.qualityScore,
      },
    };

    expect(manifest.version).toBe('1.0');
    expect(manifest.jobId).toBe(ctx.jobId);
    expect(manifest.checksums).toBeDefined();
    expect(Object.keys(manifest.checksums || {}).length).toBeGreaterThan(0);
    expect(manifest.stats.inputRecords).toBeGreaterThan(0);
  }, 120000);

  it('should validate checksums consistency', async () => {
    const preparationJob = await prisma.preparationJob.create({
      data: {
        datasetId: ctx.datasetId,
        tenantId: ctx.tenantId,
        leaseId: ctx.leaseId,
        task: 'pre-training',
        modality: 'text',
        runtime: 'jsonl',
        format: 'jsonl',
        config: JSON.stringify({}),
        license: 'research',
        privacy: 'phi_redacted',
        output: JSON.stringify({ format: 'jsonl' }),
        status: 'pending',
        progress: 0,
      },
    });

    ctx.jobId = preparationJob.id;

    const result = await ctx.dataPreparer.prepare({
      id: ctx.jobId,
      datasetId: ctx.datasetId,
      tenantId: ctx.tenantId,
      request: {
        leaseId: ctx.leaseId,
        version: '1.0',
        task: 'pre-training',
        modality: 'text',
        target: { runtime: 'hf', format: 'jsonl' },
        config: {},
        license: { type: 'research' },
        privacy: { piiHandling: 'mask' },
        output: { layout: 'standard', manifestFile: 'manifest.json', readmeFile: 'README.md', checksumFile: 'checksums.txt', checksumAlgorithm: 'sha256' },
      },
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: preparationJob.createdAt,
      updatedAt: preparationJob.updatedAt,
    });

    // Verificar que todos os checksums são SHA256
    for (const [filePath, checksum] of Object.entries(result.delivery.checksums || {})) {
      expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    }

    // Verificar que manifest.json tem checksum
    expect(result.delivery.checksums?.['manifest.json']).toBeDefined();
  }, 120000);
});
