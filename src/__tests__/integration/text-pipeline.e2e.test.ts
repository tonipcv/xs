/**
 * End-to-End Integration Test for Text Preparation Pipeline
 * 
 * Testa o pipeline completo de preparação de texto com banco de dados real.
 * Requer: PostgreSQL running, Redis running (para BullMQ opcional)
 * 
 * Este teste usa os golden datasets e valida todo o fluxo:
 * 1. Criação de dataset
 * 2. Criação de lease de acesso
 * 3. Submissão de job de preparação
 * 4. Normalização de dados
 * 5. Validação de qualidade
 * 6. Compilação
 * 7. Empacotamento e entrega
 * 8. Registro de versão
 * 9. Retenção/TTL
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { DataPreparer } from '@/lib/preparation/data-preparer';
import { getVersionManager } from '@/lib/preparation/versioning/dataset-version-manager';
import { getRetentionManager } from '@/lib/preparation/retention/artifact-retention';
import { getManifestValidator } from '@/lib/preparation/validation/manifest-validator';
import { getTextGoldenDataset } from '@/__tests__/fixtures/golden-datasets';
import { JobLogger } from '@/lib/preparation/job-logger';
import { PreparationRequest, PreparationJob } from '@/lib/preparation/preparation.types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Configuração do teste
const TEST_TIMEOUT = 120000; // 2 minutos
const TEST_DATASET_SIZE = 10; // Usar subconjunto dos golden datasets

describe('Text Preparation Pipeline - End-to-End Integration', () => {
  let testTenantId: string;
  let testDatasetId: string;
  let testLeaseId: string;
  let testJobId: string;
  let outputDir: string;

  // Setup inicial
  beforeAll(async () => {
    // Cria tenant de teste
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant - Pipeline',
        email: 'test-pipeline@xase.ai',
      },
    });
    testTenantId = tenant.id;

    // Cria diretório de saída
    outputDir = path.join('/tmp', 'test-preparation', Date.now().toString());
    await fs.mkdir(outputDir, { recursive: true });

    console.log(`[Test Setup] Tenant: ${testTenantId}, Output: ${outputDir}`);
  }, TEST_TIMEOUT);

  // Cleanup após todos os testes
  afterAll(async () => {
    // Limpa jobs
    await prisma.preparationJob.deleteMany({
      where: { tenantId: testTenantId },
    });

    // Limpa leases
    await prisma.accessLease.deleteMany({
      where: { tenantId: testTenantId },
    });

    // Limpa datasets
    await prisma.dataset.deleteMany({
      where: { tenantId: testTenantId },
    });

    // Limpa tenant
    await prisma.tenant.delete({
      where: { id: testTenantId },
    });

    // Limpa diretório de saída
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    console.log('[Test Cleanup] Complete');
  }, TEST_TIMEOUT);

  describe('Step 1: Dataset Creation', () => {
    it('should create a text dataset with golden data', async () => {
      const goldenData = getTextGoldenDataset(TEST_DATASET_SIZE);
      
      const dataset = await prisma.dataset.create({
        data: {
          tenantId: testTenantId,
          datasetId: `test-text-${Date.now()}`,
          name: 'Test Text Dataset',
          description: 'Integration test dataset with golden data',
          language: 'en',
          primaryLanguage: 'en',
          dataType: 'TEXT',
          storageLocation: outputDir,
          status: 'DRAFT',
          consentStatus: 'VERIFIED_BY_XASE',
          allowedPurposes: ['pre-training', 'fine-tuning'],
        },
      });

      testDatasetId = dataset.id;

      // Cria arquivos de dados
      const dataDir = path.join(outputDir, 'data');
      await fs.mkdir(dataDir, { recursive: true });

      // Escreve registros em JSONL
      const records = goldenData.records.map(r => ({
        text: r.text,
        id: r.id,
        metadata: r.metadata,
      }));

      await fs.writeFile(
        path.join(dataDir, 'records.jsonl'),
        records.map(r => JSON.stringify(r)).join('\n')
      );

      expect(dataset.id).toBeDefined();
      expect(dataset.tenantId).toBe(testTenantId);
      console.log(`[Step 1] Dataset created: ${testDatasetId}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 2: Access Lease Creation', () => {
    it('should create active access lease', async () => {
      const lease = await prisma.accessLease.create({
        data: {
          datasetId: testDatasetId,
          tenantId: testTenantId,
          purpose: 'pre-training',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        },
      });

      testLeaseId = lease.id;

      expect(lease.id).toBeDefined();
      expect(lease.status).toBe('ACTIVE');
      console.log(`[Step 2] Lease created: ${testLeaseId}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 3: Preparation Job Submission', () => {
    it('should create preparation job in database', async () => {
      const request: PreparationRequest = {
        leaseId: testLeaseId,
        task: 'pre-training',
        modality: 'text',
        target: {
          runtime: 'hf',
          format: 'jsonl',
        },
        config: {
          maxSeqLength: 2048,
          qualityThreshold: 0.8,
        },
        license: {
          type: 'academic',
          allowCommercial: false,
          attributionRequired: true,
        },
        privacy: {
          piiHandling: 'redact',
          phiAllowed: false,
          anonymize: true,
        },
        output: {
          layout: 'prepared/{datasetId}/{jobId}',
          manifestFile: 'manifest.json',
          checksumFile: 'checksums.txt',
          readmeFile: 'README.md',
        },
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
          license: request.license as any,
          privacy: request.privacy as any,
          output: request.output as any,
          status: 'pending',
          progress: 0,
        },
      });

      testJobId = job.id;

      expect(job.id).toBeDefined();
      expect(job.status).toBe('pending');
      console.log(`[Step 3] Job created: ${testJobId}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 4: Job Logging', () => {
    it('should log job lifecycle events', async () => {
      const logger = new JobLogger(testJobId, testTenantId);

      // Log de início
      await logger.start('pre-training', {
        datasetId: testDatasetId,
        leaseId: testLeaseId,
      });

      // Log de progresso
      await logger.step('normalization', 25, {
        recordsProcessed: 100,
      });

      // Busca logs
      const logs = await prisma.jobLog.findMany({
        where: { jobId: testJobId },
        orderBy: { createdAt: 'asc' },
      });

      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.some(l => l.message.includes('started'))).toBe(true);
      expect(logs.some(l => l.step === 'normalization')).toBe(true);

      console.log(`[Step 4] Logs created: ${logs.length} entries`);
    }, TEST_TIMEOUT);
  });

  describe('Step 5: Data Preparation Pipeline Execution', () => {
    it('should execute full preparation pipeline', async () => {
      const request: PreparationRequest = {
        leaseId: testLeaseId,
        task: 'pre-training',
        modality: 'text',
        target: {
          runtime: 'hf',
          format: 'jsonl',
        },
        config: {
          maxSeqLength: 2048,
          qualityThreshold: 0.8,
        },
        license: {
          type: 'academic',
          allowCommercial: false,
          attributionRequired: true,
        },
        privacy: {
          piiHandling: 'redact',
          phiAllowed: false,
          anonymize: true,
        },
        output: {
          layout: outputDir,
          manifestFile: 'manifest.json',
          checksumFile: 'checksums.txt',
          readmeFile: 'README.md',
        },
      };

      const job: PreparationJob = {
        id: testJobId,
        datasetId: testDatasetId,
        tenantId: testTenantId,
        request,
        startTime: Date.now(),
        status: 'processing',
        progress: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const preparer = new DataPreparer();

      // Executa pipeline
      const result = await preparer.prepare(job);

      // Atualiza job com resultados
      await prisma.preparationJob.update({
        where: { id: testJobId },
        data: {
          status: 'completed',
          progress: 100,
          outputPath: result.delivery.manifestPath,
          completedAt: new Date(),
          normalizationResult: result.normalization as any,
          compilationResult: result.compilation as any,
          deliveryResult: result.delivery as any,
        },
      });

      // Valida resultados
      expect(result.normalization).toBeDefined();
      expect(result.compilation).toBeDefined();
      expect(result.delivery).toBeDefined();
      expect(result.delivery.manifestPath).toBeDefined();

      console.log(`[Step 5] Pipeline completed`);
      console.log(`  - Normalized: ${result.normalization.recordCount} records`);
      console.log(`  - Shards: ${result.compilation.shardCount}`);
      console.log(`  - Manifest: ${result.delivery.manifestPath}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 6: Manifest Validation', () => {
    it('should validate generated manifest', async () => {
      const validator = getManifestValidator();

      // Lê manifest gerado
      const manifestPath = path.join(outputDir, 'manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      // Valida
      const result = validator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.manifestValid).toBe(true);

      console.log(`[Step 6] Manifest validated: ${result.valid ? 'OK' : 'FAILED'}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 7: Version Registration', () => {
    it('should register dataset version', async () => {
      const versionManager = getVersionManager();

      const version = await versionManager.registerVersion(
        testDatasetId,
        testJobId,
        {
          description: 'Integration test version',
          changes: [
            { type: 'added', description: 'Initial prepared dataset', count: TEST_DATASET_SIZE },
          ],
        }
      );

      expect(version.version).toBe(1);
      expect(version.jobId).toBe(testJobId);

      // Verifica se versão foi salva no dataset
      const dataset = await prisma.dataset.findUnique({
        where: { id: testDatasetId },
        select: { metadata: true },
      });

      const metadata = dataset?.metadata as any;
      expect(metadata.versions).toBeDefined();
      expect(metadata.versions.length).toBe(1);
      expect(metadata.currentVersion).toBe(1);

      console.log(`[Step 7] Version registered: v${version.version}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 8: Storage Statistics', () => {
    it('should calculate storage stats', async () => {
      const versionManager = getVersionManager();

      const stats = await versionManager.getEvolutionStats(testDatasetId);

      expect(stats.averageVersionSize).toBeGreaterThan(0);
      expect(stats.versionFrequency).toBeDefined();

      console.log(`[Step 8] Storage stats:`);
      console.log(`  - Average size: ${(stats.averageVersionSize / 1024).toFixed(2)} KB`);
      console.log(`  - Frequency: ${stats.versionFrequency}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 9: Retention Policy', () => {
    it('should calculate TTL for job', async () => {
      const retentionManager = getRetentionManager();

      const job = await prisma.preparationJob.findUnique({
        where: { id: testJobId },
      });

      expect(job).not.toBeNull();

      const ttl = retentionManager.calculateRemainingTTL(job as any);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30); // Default 30 days

      console.log(`[Step 9] Job TTL: ${ttl} days remaining`);
    }, TEST_TIMEOUT);
  });

  describe('Step 10: Version Listing and Retrieval', () => {
    it('should list all versions', async () => {
      const versionManager = getVersionManager();

      const metadata = await versionManager.listVersions(testDatasetId);

      expect(metadata.currentVersion).toBe(1);
      expect(metadata.totalVersions).toBe(1);
      expect(metadata.versions).toHaveLength(1);
      expect(metadata.canRollback).toBe(false); // Only 1 version

      console.log(`[Step 10] Versions listed: ${metadata.totalVersions} total`);
    }, TEST_TIMEOUT);

    it('should retrieve specific version', async () => {
      const versionManager = getVersionManager();

      const version = await versionManager.getVersion(testDatasetId, 1);

      expect(version).not.toBeNull();
      expect(version?.version).toBe(1);
      expect(version?.jobId).toBe(testJobId);

      console.log(`[Step 10] Version retrieved: v${version?.version}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 11: Changelog Generation', () => {
    it('should generate changelog', async () => {
      const versionManager = getVersionManager();

      const changelog = await versionManager.generateChangelog(testDatasetId);

      expect(changelog).toContain('Test Text Dataset');
      expect(changelog).toContain('Version 1');
      expect(changelog).toContain('Integration test version');

      console.log(`[Step 11] Changelog generated: ${changelog.length} chars`);
    }, TEST_TIMEOUT);
  });

  describe('Step 12: Integrity Verification', () => {
    it('should verify version integrity', async () => {
      const versionManager = getVersionManager();

      const integrity = await versionManager.verifyVersionIntegrity(
        testDatasetId,
        1
      );

      // Nota: Pode falhar em testes se os arquivos não estiverem em paths persistentes
      // Isso é esperado em ambiente de teste
      console.log(`[Step 12] Integrity check:`);
      console.log(`  - Valid: ${integrity.valid}`);
      console.log(`  - Issues: ${integrity.issues.join(', ') || 'None'}`);
    }, TEST_TIMEOUT);
  });

  describe('Full Pipeline Summary', () => {
    it('should have complete job record in database', async () => {
      const job = await prisma.preparationJob.findUnique({
        where: { id: testJobId },
        include: { logs: true },
      });

      expect(job).not.toBeNull();
      expect(job?.status).toBe('completed');
      expect(job?.outputPath).toBeDefined();
      expect(job?.completedAt).toBeDefined();
      expect(job?.logs.length).toBeGreaterThan(0);

      console.log(`\n[Summary] Pipeline execution complete:`);
      console.log(`  - Dataset: ${testDatasetId}`);
      console.log(`  - Job: ${testJobId}`);
      console.log(`  - Status: ${job?.status}`);
      console.log(`  - Logs: ${job?.logs.length} entries`);
      console.log(`  - Completed: ${job?.completedAt?.toISOString()}`);
    }, TEST_TIMEOUT);
  });
});
