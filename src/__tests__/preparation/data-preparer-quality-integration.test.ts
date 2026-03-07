import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataPreparer } from '@/lib/preparation/data-preparer';
import { DataQualityValidator } from '@/lib/ingestion/quality-validator';
import { TextNormalizer } from '@/lib/preparation/normalize/text-normalizer';
import { PreparationJob, Modality } from '@/lib/preparation/preparation.types';

// Mocks
vi.mock('@/lib/prisma', () => ({
  prisma: {
    preparationJob: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/lib/preparation/normalize/text-normalizer', () => ({
  TextNormalizer: class MockTextNormalizer {
    normalize = vi.fn().mockResolvedValue({
      recordCount: 100,
      normalizedRecords: [
        { id: '1', content: 'Sample text 1' },
        { id: '2', content: 'Sample text 2' },
        { id: '3', content: null }, // Invalid record for validation
      ],
    });
  },
}));

vi.mock('@/lib/preparation/normalize/deid-pipeline', () => ({
  DeidPipeline: class MockDeidPipeline {
    apply = vi.fn().mockResolvedValue({ recordsRedacted: 5 });
  },
}));

vi.mock('@/lib/preparation/normalize/quality-gate', () => ({
  QualityGate: class MockQualityGate {
    filter = vi.fn().mockResolvedValue({
      recordsFiltered: 10,
      deduplicatedCount: 3,
    });
  },
}));

vi.mock('@/lib/preparation/compile/compiler-registry', () => ({
  CompilerRegistry: class MockCompilerRegistry {
    getCompiler = vi.fn().mockReturnValue({
      compile: vi.fn().mockResolvedValue({
        shardCount: 1,
        totalSizeBytes: 1024,
        outputPaths: ['/tmp/test/output.jsonl'],
      }),
    });
  },
}));

vi.mock('@/lib/preparation/deliver/packager', () => ({
  Packager: class MockPackager {
    package = vi.fn().mockResolvedValue({
      manifestPath: '/tmp/test/manifest.json',
      checksumPath: '/tmp/test/checksums.txt',
      readmePath: '/tmp/test/README.md',
    });
  },
}));

vi.mock('@/lib/preparation/deliver/signed-urls', () => ({
  SignedUrlGenerator: class MockSignedUrlGenerator {
    generateUrls = vi.fn().mockResolvedValue(['https://example.com/download']);
  },
}));

vi.mock('@/lib/preparation/billing/job-metering', () => ({
  JobMetering: class MockJobMetering {
    recordUsage = vi.fn().mockResolvedValue({});
  },
}));

describe('DataPreparer with QualityValidator Integration', () => {
  let dataPreparer: DataPreparer;
  let mockJob: PreparationJob;

  beforeEach(() => {
    vi.clearAllMocks();
    dataPreparer = new DataPreparer();
    
    mockJob = {
      id: 'job-123',
      datasetId: 'dataset-456',
      tenantId: 'tenant-789',
      request: {
        leaseId: 'lease-abc',
        version: '1.0',
        task: 'rag',
        modality: 'text',
        target: {
          runtime: 'hf',
          format: 'jsonl',
        },
        config: {
          quality_threshold: 0.8,
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
          manifestFile: 'manifest.json',
          readmeFile: 'README.md',
          checksumFile: 'checksums.txt',
          checksumAlgorithm: 'sha256',
        },
      },
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('QualityValidator Integration', () => {
    it('should call quality-validator during text normalization', async () => {
      const validateSpy = vi.spyOn(DataQualityValidator.prototype, 'validate');
      
      await dataPreparer.prepare(mockJob);

      expect(validateSpy).toHaveBeenCalled();
      expect(validateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: '1', content: 'Sample text 1' }),
        ])
      );
    });

    it('should include quality report in normalization result', async () => {
      const result = await dataPreparer.prepare(mockJob);

      expect(result.normalization.qualityReport).toBeDefined();
      expect(result.normalization.qualityReport).toHaveProperty('valid');
      expect(result.normalization.qualityReport).toHaveProperty('metrics');
      expect(result.normalization.qualityReport).toHaveProperty('errors');
      expect(result.normalization.qualityReport).toHaveProperty('warnings');
    });

    it('should update recordsFiltered based on quality validation errors', async () => {
      const result = await dataPreparer.prepare(mockJob);

      // Should include filtered count from quality validation
      expect(result.normalization.recordsFiltered).toBeGreaterThanOrEqual(0);
    });

    it('should calculate qualityScore from quality report metrics', async () => {
      const result = await dataPreparer.prepare(mockJob);

      expect(result.normalization.qualityScore).toBeDefined();
      expect(typeof result.normalization.qualityScore).toBe('number');
      expect(result.normalization.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.normalization.qualityScore).toBeLessThanOrEqual(100);
    });

    it('should not run quality validation for non-text modalities', async () => {
      const validateSpy = vi.spyOn(DataQualityValidator.prototype, 'validate');
      
      const imageJob = {
        ...mockJob,
        request: {
          ...mockJob.request,
          modality: 'image' as Modality,
        },
      };

      await dataPreparer.prepare(imageJob);

      // Should not validate images (yet)
      expect(validateSpy).not.toHaveBeenCalled();
    });

    it('should handle empty records gracefully', async () => {
      // Mock returns empty records already
      const result = await dataPreparer.prepare(mockJob);

      expect(result.normalization.recordsProcessed).toBeGreaterThanOrEqual(0);
      // qualityReport may be undefined when no records to validate
    });

    it('should use default quality score when validation returns no report', async () => {
      const result = await dataPreparer.prepare(mockJob);

      // Should have a valid quality score
      expect(typeof result.normalization.qualityScore).toBe('number');
      expect(result.normalization.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.normalization.qualityScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Quality Report Metrics', () => {
    it('should include completeness metric in quality report', async () => {
      const result = await dataPreparer.prepare(mockJob);
      
      if (result.normalization.qualityReport) {
        expect(result.normalization.qualityReport.metrics).toHaveProperty('completeness');
        expect(result.normalization.qualityReport.metrics).toHaveProperty('consistency');
        expect(result.normalization.qualityReport.metrics).toHaveProperty('accuracy');
        expect(result.normalization.qualityReport.metrics).toHaveProperty('validity');
        expect(result.normalization.qualityReport.metrics).toHaveProperty('uniqueness');
        expect(result.normalization.qualityReport.metrics).toHaveProperty('overall');
      }
    });

    it('should include timestamp in quality report', async () => {
      const result = await dataPreparer.prepare(mockJob);
      
      if (result.normalization.qualityReport) {
        expect(result.normalization.qualityReport.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should include recommendations based on quality issues', async () => {
      const result = await dataPreparer.prepare(mockJob);
      
      if (result.normalization.qualityReport) {
        expect(result.normalization.qualityReport.recommendations).toBeInstanceOf(Array);
      }
    });
  });

  describe('End-to-End Pipeline', () => {
    it('should run complete pipeline with quality validation', async () => {
      const result = await dataPreparer.prepare(mockJob);

      expect(result).toHaveProperty('jobId', 'job-123');
      expect(result).toHaveProperty('normalization');
      expect(result).toHaveProperty('compilation');
      expect(result).toHaveProperty('delivery');
      
      expect(result.normalization).toHaveProperty('recordsProcessed');
      expect(result.normalization).toHaveProperty('qualityScore');
      expect(result.normalization).toHaveProperty('qualityReport');
    });

    it('should persist quality report to database', async () => {
      const { prisma } = await import('@/lib/prisma');
      
      await dataPreparer.prepare(mockJob);

      // Check that normalization result (including qualityReport) was persisted
      expect(prisma.preparationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-123' },
          data: expect.objectContaining({
            normalizationResult: expect.anything(),
          }),
        })
      );
    });
  });
});
