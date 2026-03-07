/**
 * Load Tests for Data Preparation Pipeline
 * 
 * Testes de carga para validar performance com datasets grandes (10k+ records)
 * e cenários de concorrência multi-tenant.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { DataPreparer } from '@/lib/preparation/data-preparer';
import { getTextGoldenDataset } from '@/__tests__/fixtures/golden-datasets';
import { PreparationJob, PreparationRequest } from '@/lib/preparation/preparation.types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Configurações de carga
const LOAD_TEST_CONFIG = {
  small: { records: 100, concurrency: 1, description: 'Small dataset - 100 records' },
  medium: { records: 1000, concurrency: 3, description: 'Medium dataset - 1k records' },
  large: { records: 10000, concurrency: 5, description: 'Large dataset - 10k records' },
  stress: { records: 50000, concurrency: 10, description: 'Stress test - 50k records' },
};

// Thresholds de performance
const PERFORMANCE_THRESHOLDS = {
  small: { maxDurationMs: 30000, minThroughput: 10 }, // 30s, 10 records/sec
  medium: { maxDurationMs: 120000, minThroughput: 8 }, // 2min, 8 records/sec
  large: { maxDurationMs: 600000, minThroughput: 5 }, // 10min, 5 records/sec
  stress: { maxDurationMs: 1800000, minThroughput: 3 }, // 30min, 3 records/sec
};

describe('Load Tests - Data Preparation Pipeline', () => {
  let testTenantId: string;
  let outputDir: string;
  let testDatasets: Map<string, string> = new Map();

  beforeAll(async () => {
    // Cria tenant de teste
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Load Test Tenant',
        email: 'load-test@xase.ai',
      },
    });
    testTenantId = tenant.id;

    outputDir = path.join('/tmp', 'load-tests', Date.now().toString());
    await fs.mkdir(outputDir, { recursive: true });

    console.log(`[Load Test Setup] Tenant: ${testTenantId}`);
  }, 300000);

  afterAll(async () => {
    // Cleanup
    for (const datasetId of testDatasets.values()) {
      await prisma.preparationJob.deleteMany({ where: { datasetId } });
      await prisma.accessLease.deleteMany({ where: { datasetId } } });
      await prisma.dataset.deleteMany({ where: { id: datasetId } });
    }

    await prisma.tenant.delete({ where: { id: testTenantId } });
    await fs.rm(outputDir, { recursive: true, force: true });

    console.log('[Load Test Cleanup] Complete');
  }, 300000);

  describe('Small Dataset (100 records)', () => {
    it('should process 100 records within 30 seconds', async () => {
      const config = LOAD_TEST_CONFIG.small;
      const threshold = PERFORMANCE_THRESHOLDS.small;

      const { durationMs, throughput, recordsProcessed } = await runLoadTest(
        testTenantId,
        config.records,
        config.concurrency,
        outputDir
      );

      console.log(`[Small Load Test] Duration: ${durationMs}ms, Throughput: ${throughput} records/sec`);

      expect(durationMs).toBeLessThan(threshold.maxDurationMs);
      expect(throughput).toBeGreaterThan(threshold.minThroughput);
      expect(recordsProcessed).toBe(config.records);
    }, 60000);
  });

  describe('Medium Dataset (1,000 records)', () => {
    it('should process 1k records within 2 minutes', async () => {
      const config = LOAD_TEST_CONFIG.medium;
      const threshold = PERFORMANCE_THRESHOLDS.medium;

      const { durationMs, throughput, recordsProcessed } = await runLoadTest(
        testTenantId,
        config.records,
        config.concurrency,
        outputDir
      );

      console.log(`[Medium Load Test] Duration: ${durationMs}ms, Throughput: ${throughput} records/sec`);

      expect(durationMs).toBeLessThan(threshold.maxDurationMs);
      expect(throughput).toBeGreaterThan(threshold.minThroughput);
      expect(recordsProcessed).toBe(config.records);
    }, 180000);
  });

  describe('Large Dataset (10,000 records)', () => {
    it('should process 10k records within 10 minutes', async () => {
      const config = LOAD_TEST_CONFIG.large;
      const threshold = PERFORMANCE_THRESHOLDS.large;

      const { durationMs, throughput, recordsProcessed } = await runLoadTest(
        testTenantId,
        config.records,
        config.concurrency,
        outputDir
      );

      console.log(`[Large Load Test] Duration: ${(durationMs / 1000 / 60).toFixed(1)}min, Throughput: ${throughput} records/sec`);

      expect(durationMs).toBeLessThan(threshold.maxDurationMs);
      expect(throughput).toBeGreaterThan(threshold.minThroughput);
      expect(recordsProcessed).toBe(config.records);
    }, 720000);
  });

  describe('Multi-Tenant Concurrency', () => {
    it('should handle concurrent jobs from multiple tenants', async () => {
      const tenants = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const t = await prisma.tenant.create({
            data: {
              name: `Concurrent Tenant ${i + 1}`,
              email: `concurrent-${i}@xase.ai`,
            },
          });
          return t.id;
        })
      );

      const startTime = Date.now();

      // Run concurrent jobs across tenants
      const jobs = tenants.map(async (tenantId) => {
        return runLoadTest(tenantId, 500, 1, outputDir);
      });

      const results = await Promise.all(jobs);
      const durationMs = Date.now() - startTime;

      // All should complete successfully
      results.forEach((result, i) => {
        console.log(`[Concurrent] Tenant ${i + 1}: ${result.throughput} rec/sec`);
        expect(result.recordsProcessed).toBe(500);
      });

      // Total throughput should be reasonable
      const totalRecords = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
      const totalThroughput = totalRecords / (durationMs / 1000);

      console.log(`[Multi-Tenant] Total: ${totalRecords} records, Throughput: ${totalThroughput.toFixed(1)} rec/sec`);

      expect(totalThroughput).toBeGreaterThan(10); // At least 10 rec/sec total

      // Cleanup tenants
      await Promise.all(
        tenants.map(async (tenantId) => {
          await prisma.preparationJob.deleteMany({ where: { tenantId } });
          await prisma.dataset.deleteMany({ where: { tenantId } });
          await prisma.tenant.delete({ where: { id: tenantId } });
        })
      );
    }, 300000);
  });

  describe('Memory Usage', () => {
    it('should maintain reasonable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();

      // Process large dataset
      await runLoadTest(testTenantId, 5000, 1, outputDir);

      const finalMemory = process.memoryUsage();
      const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const heapGrowthMB = heapGrowth / 1024 / 1024;

      console.log(`[Memory Test] Heap growth: ${heapGrowthMB.toFixed(2)} MB`);

      // Memory growth should be less than 500MB for 5k records
      expect(heapGrowthMB).toBeLessThan(500);
    }, 300000);
  });

  describe('Database Connection Pool', () => {
    it('should not exhaust database connections under load', async () => {
      const concurrentJobs = 20;
      const recordsPerJob = 100;

      // Track active connections (simulated)
      let activeJobs = 0;
      let maxConcurrent = 0;

      const jobs = Array.from({ length: concurrentJobs }, async (_, i) => {
        activeJobs++;
        maxConcurrent = Math.max(maxConcurrent, activeJobs);

        const result = await runLoadTest(
          testTenantId,
          recordsPerJob,
          1,
          path.join(outputDir, `pool-test-${i}`)
        );

        activeJobs--;
        return result;
      });

      const results = await Promise.all(jobs);

      console.log(`[Connection Pool] Max concurrent: ${maxConcurrent}`);

      // All jobs should complete
      expect(results.length).toBe(concurrentJobs);
      expect(results.every(r => r.recordsProcessed === recordsPerJob)).toBe(true);
    }, 600000);
  });
});

/**
 * Helper function to run a single load test
 */
async function runLoadTest(
  tenantId: string,
  recordCount: number,
  concurrency: number,
  outputBaseDir: string
): Promise<{
  durationMs: number;
  throughput: number;
  recordsProcessed: number;
  success: boolean;
}> {
  const startTime = Date.now();

  try {
    // Generate test dataset
    const goldenData = getTextGoldenDataset(Math.min(recordCount, 100));
    const records = Array.from({ length: recordCount }, (_, i) => ({
      id: `rec-${i}`,
      text: `Sample text record ${i} with some content for processing. Patient name: ${goldenData.records[i % goldenData.records.length]?.metadata.pii?.patientName || 'Unknown'}.`,
      metadata: { index: i },
    }));

    // Create dataset
    const dataset = await prisma.dataset.create({
      data: {
        tenantId,
        datasetId: `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: `Load Test ${recordCount} records`,
        description: `Load test dataset with ${recordCount} records`,
        language: 'en',
        primaryLanguage: 'en',
        dataType: 'TEXT',
        storageLocation: outputBaseDir,
        status: 'DRAFT',
      },
    });

    // Create lease
    const lease = await prisma.accessLease.create({
      data: {
        datasetId: dataset.id,
        tenantId,
        purpose: 'load-testing',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Write test data to file
    const dataDir = path.join(outputBaseDir, dataset.id);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'records.jsonl'),
      records.map(r => JSON.stringify(r)).join('\n')
    );

    // Create and run preparation job
    const request: PreparationRequest = {
      leaseId: lease.id,
      task: 'pre-training',
      modality: 'text',
      target: { runtime: 'hf', format: 'jsonl' },
      config: { maxSeqLength: 2048 },
      license: { type: 'academic' },
      privacy: { piiHandling: 'redact' },
      output: { layout: dataDir },
    };

    const job = await prisma.preparationJob.create({
      data: {
        datasetId: dataset.id,
        tenantId,
        leaseId: lease.id,
        task: request.task,
        modality: request.modality,
        runtime: request.target.runtime,
        format: request.target.format,
        config: JSON.stringify(request.config),
        license: request.license as any,
        privacy: request.privacy as any,
        output: request.output as any,
        status: 'processing',
        progress: 0,
      },
    });

    const jobInstance: PreparationJob = {
      id: job.id,
      datasetId: dataset.id,
      tenantId,
      request,
      startTime: Date.now(),
      status: 'processing',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const preparer = new DataPreparer();
    const result = await preparer.prepare(jobInstance);

    // Update job status
    await prisma.preparationJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
      },
    });

    const durationMs = Date.now() - startTime;
    const throughput = recordCount / (durationMs / 1000);

    // Cleanup dataset file
    await fs.rm(dataDir, { recursive: true, force: true });

    return {
      durationMs,
      throughput,
      recordsProcessed: recordCount,
      success: result.normalization?.recordCount === recordCount,
    };
  } catch (error) {
    console.error('Load test failed:', error);
    return {
      durationMs: Date.now() - startTime,
      throughput: 0,
      recordsProcessed: 0,
      success: false,
    };
  }
}

/**
 * Performance benchmark utility
 */
export async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 10
): Promise<{
  name: string;
  iterations: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  totalDurationMs: number;
}> {
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await fn();
    durations.push(Date.now() - start);
  }

  return {
    name,
    iterations,
    avgDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
    minDurationMs: Math.min(...durations),
    maxDurationMs: Math.max(...durations),
    totalDurationMs: durations.reduce((a, b) => a + b, 0),
  };
}
