/**
 * Tests for ManifestValidator
 * 
 * Testes para validação de manifest, checksums e README.
 */

import { 
  ManifestValidator, 
  DeliveryManifest,
  getManifestValidator,
  resetManifestValidator,
} from '@/lib/preparation/validation/manifest-validator';
import { describe, it, expect, beforeEach } from 'vitest';

describe('ManifestValidator', () => {
  let validator: ManifestValidator;

  beforeEach(() => {
    resetManifestValidator();
    validator = getManifestValidator();
  });

  describe('validateManifest', () => {
    const createValidManifest = (): DeliveryManifest => ({
      version: '1.0',
      createdAt: new Date().toISOString(),
      datasetId: 'dataset-001',
      tenantId: 'tenant-001',
      jobId: 'job-001',
      task: 'pre-training',
      modality: 'text',
      format: 'jsonl',
      runtime: 'hf',
      files: [
        {
          path: 'data/shard-0001.jsonl',
          size: 1024000,
          checksum: 'a'.repeat(64),
          checksumAlgorithm: 'sha256',
          records: 1000,
          format: 'jsonl',
        },
        {
          path: 'data/shard-0002.jsonl',
          size: 1024000,
          checksum: 'b'.repeat(64),
          checksumAlgorithm: 'sha256',
          records: 1000,
          format: 'jsonl',
        },
      ],
      statistics: {
        totalFiles: 2,
        totalSizeBytes: 2048000,
        totalRecords: 2000,
        averageRecordSizeBytes: 1024,
      },
      checksums: {
        algorithm: 'sha256',
        manifestChecksum: 'c'.repeat(64),
        files: {
          'data/shard-0001.jsonl': 'a'.repeat(64),
          'data/shard-0002.jsonl': 'b'.repeat(64),
        },
      },
    });

    it('should validate a correct manifest', () => {
      const manifest = createValidManifest();
      const result = validator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.manifestValid).toBe(true);
    });

    it('should reject null manifest', () => {
      const result = validator.validateManifest(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest must be an object');
    });

    it('should reject missing required fields', () => {
      const manifest = { version: '1.0' } as any;
      const result = validator.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing required field'))).toBe(true);
    });

    it('should validate version format', () => {
      const manifest = createValidManifest();
      manifest.version = 'invalid';
      
      const result = validator.validateManifest(manifest);

      expect(result.errors.some(e => e.includes('Invalid version format'))).toBe(true);
    });

    it('should validate createdAt date', () => {
      const manifest = createValidManifest();
      manifest.createdAt = 'not-a-date';
      
      const result = validator.validateManifest(manifest);

      expect(result.errors.some(e => e.includes('Invalid createdAt'))).toBe(true);
    });

    it('should validate files array', () => {
      const manifest = createValidManifest();
      manifest.files = [];
      
      const result = validator.validateManifest(manifest);

      expect(result.warnings).toContain('No files in manifest');
    });

    it('should validate file entries', () => {
      const manifest = createValidManifest();
      manifest.files[0].path = '';
      manifest.files[0].size = -1;
      manifest.files[0].checksum = 'invalid';
      
      const result = validator.validateManifest(manifest);

      expect(result.errors.some(e => e.includes('missing path'))).toBe(true);
      expect(result.errors.some(e => e.includes('invalid size'))).toBe(true);
      expect(result.errors.some(e => e.includes('invalid SHA256 checksum format'))).toBe(true);
    });

    it('should validate statistics consistency', () => {
      const manifest = createValidManifest();
      manifest.statistics.totalFiles = 10; // Wrong count
      
      const result = validator.validateManifest(manifest);

      expect(result.errors.some(e => e.includes('File count mismatch'))).toBe(true);
      expect(result.consistencyValid).toBe(false);
    });

    it('should validate size consistency', () => {
      const manifest = createValidManifest();
      manifest.statistics.totalSizeBytes = 999999; // Wrong size
      
      const result = validator.validateManifest(manifest);

      expect(result.errors.some(e => e.includes('Size mismatch'))).toBe(true);
    });

    it('should validate checksum consistency', () => {
      const manifest = createValidManifest();
      // Remove one file from checksums
      delete manifest.checksums.files['data/shard-0001.jsonl'];
      
      const result = validator.validateManifest(manifest);

      expect(result.errors.some(e => e.includes('missing in checksums'))).toBe(true);
      expect(result.consistencyValid).toBe(false);
    });

    it('should warn about non-standard checksum algorithm', () => {
      const manifest = createValidManifest();
      manifest.checksums.algorithm = 'md5';
      
      const result = validator.validateManifest(manifest);

      expect(result.warnings.some(e => e.includes('not standard'))).toBe(true);
    });
  });

  describe('parseChecksums', () => {
    it('should parse valid checksums.txt', () => {
      const content = `
# Checksums for dataset
a${'a'.repeat(63)}  data/file1.jsonl
b${'b'.repeat(63)}  data/file2.jsonl
      `.trim();

      const entries = validator.parseChecksums(content);

      expect(entries).toHaveLength(2);
      expect(entries[0].file).toBe('data/file1.jsonl');
      expect(entries[0].hash).toBe('a'.repeat(64));
    });

    it('should ignore comments and empty lines', () => {
      const content = `
# This is a comment

a${'a'.repeat(63)}  data/file1.jsonl

# Another comment
      `;

      const entries = validator.parseChecksums(content);

      expect(entries).toHaveLength(1);
    });

    it('should return empty array for invalid content', () => {
      const content = 'invalid checksum format';
      const entries = validator.parseChecksums(content);

      expect(entries).toHaveLength(0);
    });
  });

  describe('validateChecksums', () => {
    it('should validate matching checksums', () => {
      const manifest: DeliveryManifest = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files: [{
          path: 'data/file1.jsonl',
          size: 1000,
          checksum: 'a'.repeat(64),
          checksumAlgorithm: 'sha256',
        }],
        statistics: {
          totalFiles: 1,
          totalSizeBytes: 1000,
          totalRecords: 100,
          averageRecordSizeBytes: 10,
        },
        checksums: {
          algorithm: 'sha256',
          manifestChecksum: 'c'.repeat(64),
          files: {
            'data/file1.jsonl': 'a'.repeat(64),
          },
        },
      };

      const content = `${'a'.repeat(64)}  data/file1.jsonl`;
      const result = validator.validateChecksums(content, manifest);

      expect(result.valid).toBe(true);
      expect(result.checksumsValid).toBe(true);
    });

    it('should detect checksum mismatch', () => {
      const manifest: DeliveryManifest = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files: [{
          path: 'data/file1.jsonl',
          size: 1000,
          checksum: 'a'.repeat(64),
          checksumAlgorithm: 'sha256',
        }],
        statistics: {
          totalFiles: 1,
          totalSizeBytes: 1000,
          totalRecords: 100,
          averageRecordSizeBytes: 10,
        },
        checksums: {
          algorithm: 'sha256',
          manifestChecksum: 'c'.repeat(64),
          files: {
            'data/file1.jsonl': 'a'.repeat(64),
          },
        },
      };

      const content = `${'b'.repeat(64)}  data/file1.jsonl`; // Different hash
      const result = validator.validateChecksums(content, manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Checksum mismatch'))).toBe(true);
    });

    it('should detect missing files in checksums', () => {
      const manifest: DeliveryManifest = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files: [{
          path: 'data/file1.jsonl',
          size: 1000,
          checksum: 'a'.repeat(64),
          checksumAlgorithm: 'sha256',
        }],
        statistics: {
          totalFiles: 1,
          totalSizeBytes: 1000,
          totalRecords: 100,
          averageRecordSizeBytes: 10,
        },
        checksums: {
          algorithm: 'sha256',
          manifestChecksum: 'c'.repeat(64),
          files: {},
        },
      };

      const content = `${'a'.repeat(64)}  other-file.jsonl`;
      const result = validator.validateChecksums(content, manifest);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject empty checksums', () => {
      const manifest: DeliveryManifest = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files: [],
        statistics: {
          totalFiles: 0,
          totalSizeBytes: 0,
          totalRecords: 0,
          averageRecordSizeBytes: 0,
        },
        checksums: {
          algorithm: 'sha256',
          manifestChecksum: 'c'.repeat(64),
          files: {},
        },
      };

      const result = validator.validateChecksums('', manifest);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No valid checksum entries found');
    });
  });

  describe('generateChecksumsTxt', () => {
    it('should generate valid checksums.txt', () => {
      const manifest: DeliveryManifest = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files: [
          {
            path: 'data/file1.jsonl',
            size: 1000,
            checksum: 'A'.repeat(64),
            checksumAlgorithm: 'sha256',
          },
        ],
        statistics: {
          totalFiles: 1,
          totalSizeBytes: 1000,
          totalRecords: 100,
          averageRecordSizeBytes: 10,
        },
        checksums: {
          algorithm: 'sha256',
          manifestChecksum: 'c'.repeat(64),
          files: {
            'data/file1.jsonl': 'a'.repeat(64),
          },
        },
      };

      const content = validator.generateChecksumsTxt(manifest);

      expect(content).toContain('# Checksums for dataset delivery');
      expect(content).toContain('Dataset: dataset-001');
      expect(content).toContain(`${'a'.repeat(64)}  data/file1.jsonl`);
      expect(content).toContain('Manifest checksum:');
    });
  });

  describe('validateReadme', () => {
    it('should validate correct README', () => {
      const manifest = {
        datasetId: 'dataset-001',
        format: 'jsonl',
        task: 'pre-training',
      } as DeliveryManifest;

      const content = `
# Dataset: dataset-001

## Format
This dataset is in jsonl format.

## Files
Contains pre-training data.
      `;

      const result = validator.validateReadme(content, manifest);

      expect(result.readmeValid).toBe(true);
    });

    it('should warn about missing sections', () => {
      const manifest = {
        datasetId: 'dataset-001',
        format: 'jsonl',
      } as DeliveryManifest;

      const content = 'Minimal README';
      const result = validator.validateReadme(content, manifest);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('missing section'))).toBe(true);
    });

    it('should warn if datasetId not mentioned', () => {
      const manifest = {
        datasetId: 'dataset-001',
        format: 'jsonl',
      } as DeliveryManifest;

      const content = `
# Dataset
## Format
## Files
      `;
      const result = validator.validateReadme(content, manifest);

      expect(result.warnings.some(w => w.includes('datasetId'))).toBe(true);
    });
  });

  describe('validateDelivery', () => {
    it('should validate complete delivery package', () => {
      const manifest: DeliveryManifest = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files: [{
          path: 'data/file1.jsonl',
          size: 1000,
          checksum: 'a'.repeat(64),
          checksumAlgorithm: 'sha256',
        }],
        statistics: {
          totalFiles: 1,
          totalSizeBytes: 1000,
          totalRecords: 100,
          averageRecordSizeBytes: 10,
        },
        checksums: {
          algorithm: 'sha256',
          manifestChecksum: 'c'.repeat(64),
          files: {
            'data/file1.jsonl': 'a'.repeat(64),
          },
        },
      };

      const checksumsTxt = `${'a'.repeat(64)}  data/file1.jsonl`;
      const readme = `
# Dataset: dataset-001
## Format: jsonl
## Files
      `;

      const result = validator.validateDelivery(manifest, checksumsTxt, readme);

      expect(result.valid).toBe(true);
      expect(result.manifestValid).toBe(true);
      expect(result.checksumsValid).toBe(true);
      expect(result.readmeValid).toBe(true);
    });
  });

  describe('calculateChecksum', () => {
    it('should calculate SHA256 checksum', () => {
      const content = 'test content';
      const checksum = validator.calculateChecksum(content);

      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]+$/);
    });

    it('should be deterministic', () => {
      const content = 'test content';
      const checksum1 = validator.calculateChecksum(content);
      const checksum2 = validator.calculateChecksum(content);

      expect(checksum1).toBe(checksum2);
    });

    it('should handle Buffer input', () => {
      const content = Buffer.from('test content');
      const checksum = validator.calculateChecksum(content);

      expect(checksum).toHaveLength(64);
    });
  });

  describe('generateManifest', () => {
    it('should generate complete manifest', () => {
      const files = [
        {
          path: 'data/file1.jsonl',
          size: 1000,
          checksum: 'a'.repeat(64),
          records: 100,
          format: 'jsonl',
        },
        {
          path: 'data/file2.jsonl',
          size: 2000,
          checksum: 'b'.repeat(64),
          records: 200,
          format: 'jsonl',
        },
      ];

      const manifest = validator.generateManifest({
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files,
        metadata: { schema: { id: 'string' } },
      });

      expect(manifest.version).toBe('1.0');
      expect(manifest.datasetId).toBe('dataset-001');
      expect(manifest.files).toHaveLength(2);
      expect(manifest.statistics.totalFiles).toBe(2);
      expect(manifest.statistics.totalSizeBytes).toBe(3000);
      expect(manifest.statistics.totalRecords).toBe(300);
      expect(manifest.checksums.algorithm).toBe('sha256');
      expect(manifest.checksums.manifestChecksum).toBeDefined();
      expect(manifest.metadata?.schema).toBeDefined();
    });

    it('should calculate average record size correctly', () => {
      const files = [
        {
          path: 'data/file1.jsonl',
          size: 1000,
          checksum: 'a'.repeat(64),
          records: 100,
        },
      ];

      const manifest = validator.generateManifest({
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files,
      });

      expect(manifest.statistics.averageRecordSizeBytes).toBe(10); // 1000 / 100
    });

    it('should handle empty files', () => {
      const manifest = validator.generateManifest({
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        jobId: 'job-001',
        task: 'pre-training',
        modality: 'text',
        format: 'jsonl',
        runtime: 'hf',
        files: [],
      });

      expect(manifest.statistics.totalFiles).toBe(0);
      expect(manifest.statistics.averageRecordSizeBytes).toBe(0);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const v1 = getManifestValidator();
      const v2 = getManifestValidator();

      expect(v1).toBe(v2);
    });

    it('should create new instance after reset', () => {
      const v1 = getManifestValidator();
      resetManifestValidator();
      const v2 = getManifestValidator();

      expect(v1).not.toBe(v2);
    });
  });
});
