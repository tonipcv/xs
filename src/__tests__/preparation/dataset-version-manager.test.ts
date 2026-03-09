/**
 * Tests for DatasetVersionManager
 * 
 * Testes para gerenciamento de versões de datasets.
 */

import { 
  DatasetVersionManager,
  getVersionManager,
  resetVersionManager,
} from '@/lib/preparation/versioning/dataset-version-manager';
import { prisma } from '@/lib/prisma';
import { vi, describe, it, expect, beforeEach } from 'vitest';

type MockType = ReturnType<typeof vi.fn>;

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    preparationJob: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    dataset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('DatasetVersionManager', () => {
  let manager: DatasetVersionManager;

  beforeEach(() => {
    resetVersionManager();
    manager = getVersionManager();
    vi.clearAllMocks();
  });

  describe('getNextVersion', () => {
    it('should return 1 for new dataset', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);

      const version = await manager.getNextVersion('dataset-001');

      expect(version).toBe(1);
    });

    it('should return next version based on completed jobs', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        { id: 'job-001', status: 'completed', outputPath: '/path/1' },
        { id: 'job-002', status: 'completed', outputPath: '/path/2' },
        { id: 'job-003', status: 'completed', outputPath: '/path/3' },
      ]);

      const version = await manager.getNextVersion('dataset-001');

      expect(version).toBe(4);
    });

    it('should not count jobs without outputPath', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        { id: 'job-001', status: 'completed', outputPath: '/path/1' },
        { id: 'job-002', status: 'completed', outputPath: null },
        { id: 'job-003', status: 'completed', outputPath: '/path/3' },
      ]);

      const version = await manager.getNextVersion('dataset-001');

      expect(version).toBe(3);
    });

    it('should not count failed jobs', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        { id: 'job-001', status: 'completed', outputPath: '/path/1' },
        { id: 'job-002', status: 'failed', outputPath: '/path/2' },
      ]);

      const version = await manager.getNextVersion('dataset-001');

      expect(version).toBe(2);
    });
  });

  describe('registerVersion', () => {
    const mockJob = {
      id: 'job-001',
      datasetId: 'dataset-001',
      tenantId: 'tenant-001',
      status: 'completed',
      completedAt: new Date('2024-01-15'),
      createdAt: new Date('2024-01-15'),
      manifestPath: '/path/manifest.json',
      downloadUrls: [{ url: 'https://example.com/download' }],
      compilationResult: { totalRecords: 1000, totalBytes: 1024000 },
      deliveryResult: { totalBytes: 1024000, manifestChecksum: 'abc123' },
    };

    it('should register new version successfully', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);
      (prisma.preparationJob.findUnique as unknown as MockType).mockResolvedValue(mockJob);
      (prisma.dataset.findUnique as unknown as MockType).mockResolvedValue({ metadata: {} });
      (prisma.dataset.update as unknown as MockType).mockResolvedValue({});

      const version = await manager.registerVersion('dataset-001', 'job-001', {
        description: 'Initial version',
        changes: [{ type: 'added', description: 'First dataset', count: 1000 }],
      });

      expect(version.version).toBe(1);
      expect(version.jobId).toBe('job-001');
      expect(version.description).toBe('Initial version');
      expect(version.recordCount).toBe(1000);
      expect(version.sizeBytes).toBe(1024000);
      expect(version.checksum).toBe('abc123');
    });

    it('should increment version for subsequent registrations', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        { id: 'job-prev', status: 'completed', outputPath: '/prev' },
      ]);
      (prisma.preparationJob.findUnique as unknown as MockType).mockResolvedValue(mockJob);
      (prisma.dataset.findUnique as unknown as MockType).mockResolvedValue({
        metadata: { versions: [{ version: 1 }] },
      });
      (prisma.dataset.update as unknown as MockType).mockResolvedValue({});

      const version = await manager.registerVersion('dataset-001', 'job-001');

      expect(version.version).toBe(2);
    });

    it('should throw error if job not found', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);
      (prisma.preparationJob.findUnique as unknown as MockType).mockResolvedValue(null);

      await expect(
        manager.registerVersion('dataset-001', 'non-existent')
      ).rejects.toThrow('Job non-existent not found');
    });

    it('should use default description when not provided', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);
      (prisma.preparationJob.findUnique as unknown as MockType).mockResolvedValue(mockJob);
      (prisma.dataset.findUnique as unknown as MockType).mockResolvedValue({ metadata: {} });
      (prisma.dataset.update as unknown as MockType).mockResolvedValue({});

      const version = await manager.registerVersion('dataset-001', 'job-001');

      expect(version.description).toContain('Version 1');
      expect(version.description).toContain('job-001');
    });

    it('should store version metadata in dataset', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);
      (prisma.preparationJob.findUnique as unknown as MockType).mockResolvedValue(mockJob);
      (prisma.dataset.findUnique as unknown as MockType).mockResolvedValue({ metadata: {} });
      (prisma.dataset.update as unknown as MockType).mockResolvedValue({});

      await manager.registerVersion('dataset-001', 'job-001', {
        changes: [{ type: 'added', description: 'New records', count: 500 }],
      });

      expect(prisma.dataset.update).toHaveBeenCalledWith({
        where: { id: 'dataset-001' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            versions: expect.arrayContaining([
              expect.objectContaining({
                version: 1,
                jobId: 'job-001',
              }),
            ]),
            currentVersion: 1,
          }),
        }),
      });
    });
  });

  describe('listVersions', () => {
    it('should return empty metadata for dataset with no jobs', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);

      const metadata = await manager.listVersions('dataset-001');

      expect(metadata.currentVersion).toBe(0);
      expect(metadata.totalVersions).toBe(0);
      expect(metadata.versions).toHaveLength(0);
      expect(metadata.canRollback).toBe(false);
    });

    it('should list all versions in order', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          manifestPath: '/manifest/1.json',
          downloadUrls: ['url1'],
          compilationResult: { totalRecords: 100 },
          deliveryResult: { totalBytes: 1000 },
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          manifestPath: '/manifest/2.json',
          downloadUrls: ['url2'],
          compilationResult: { totalRecords: 200 },
          deliveryResult: { totalBytes: 2000 },
        },
      ]);

      const metadata = await manager.listVersions('dataset-001');

      expect(metadata.totalVersions).toBe(2);
      expect(metadata.currentVersion).toBe(2);
      expect(metadata.canRollback).toBe(true);
      expect(metadata.versions[0].version).toBe(1);
      expect(metadata.versions[1].version).toBe(2);
      expect(metadata.versions[1].recordCount).toBe(200);
    });

    it('should filter out failed jobs', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'job-002',
          status: 'failed',
          outputPath: null,
          completedAt: null,
          createdAt: new Date('2024-01-02'),
        },
      ]);

      const metadata = await manager.listVersions('dataset-001');

      expect(metadata.totalVersions).toBe(1);
    });
  });

  describe('getVersion', () => {
    it('should return specific version', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
        },
      ]);

      const version = await manager.getVersion('dataset-001', 2);

      expect(version).not.toBeNull();
      expect(version?.version).toBe(2);
      expect(version?.jobId).toBe('job-002');
    });

    it('should return null for non-existent version', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const version = await manager.getVersion('dataset-001', 99);

      expect(version).toBeNull();
    });
  });

  describe('compareVersions', () => {
    it('should compare two versions correctly', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          compilationResult: { totalRecords: 100 },
          deliveryResult: { totalBytes: 1000 },
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          compilationResult: { totalRecords: 150 },
          deliveryResult: { totalBytes: 1500 },
        },
      ]);

      const comparison = await manager.compareVersions('dataset-001', 1, 2);

      expect(comparison.fromVersion).toBe(1);
      expect(comparison.toVersion).toBe(2);
      expect(comparison.added).toBe(50); // 150 - 100
      expect(comparison.sizeDeltaBytes).toBe(500); // 1500 - 1000
    });

    it('should handle version decrease (removed records)', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          compilationResult: { totalRecords: 200 },
          deliveryResult: { totalBytes: 2000 },
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          compilationResult: { totalRecords: 150 },
          deliveryResult: { totalBytes: 1500 },
        },
      ]);

      const comparison = await manager.compareVersions('dataset-001', 1, 2);

      expect(comparison.added).toBe(0);
      expect(comparison.removed).toBe(50); // 200 - 150
    });

    it('should throw error for non-existent versions', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);

      await expect(
        manager.compareVersions('dataset-001', 1, 2)
      ).rejects.toThrow('One or both versions not found');
    });
  });

  describe('rollbackToVersion', () => {
    it('should rollback successfully', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
        },
        {
          id: 'job-003',
          status: 'completed',
          outputPath: '/path/3',
          completedAt: new Date('2024-01-30'),
          createdAt: new Date('2024-01-30'),
        },
      ]);
      (prisma.preparationJob.update as unknown as MockType).mockResolvedValue({});

      const result = await manager.rollbackToVersion('dataset-001', 1, 'user-001');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Rolled back from v3 to v1');
      expect(result.message).toContain('2 versions marked as obsolete');
      expect(prisma.preparationJob.update).toHaveBeenCalledTimes(2);
    });

    it('should fail if already at target version', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const result = await manager.rollbackToVersion('dataset-001', 1, 'user-001');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Already at target version');
    });

    it('should fail for invalid version', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const result = await manager.rollbackToVersion('dataset-001', 0, 'user-001');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid version number');
    });

    it('should mark jobs as failed during rollback', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
        },
      ]);
      (prisma.preparationJob.update as unknown as MockType).mockResolvedValue({});

      await manager.rollbackToVersion('dataset-001', 1, 'user-001');

      expect(prisma.preparationJob.update).toHaveBeenCalledWith({
        where: { id: 'job-002' },
        data: expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('Rolled back'),
        }),
      });
    });
  });

  describe('generateChangelog', () => {
    it('should generate changelog for all versions', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          compilationResult: { totalRecords: 100 },
          deliveryResult: { totalBytes: 1000000, manifestChecksum: 'hash1' },
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          compilationResult: { totalRecords: 200 },
          deliveryResult: { totalBytes: 2000000, manifestChecksum: 'hash2' },
        },
      ]);

      const changelog = await manager.generateChangelog('dataset-001');

      expect(changelog).toContain('# Dataset dataset-001 Changelog');
      expect(changelog).toContain('## Version 1');
      expect(changelog).toContain('## Version 2');
      expect(changelog).toContain('Records: 100');
      expect(changelog).toContain('Records: 200');
      expect(changelog).toContain('Size:');
      expect(changelog).toContain('Checksum:');
    });

    it('should generate changelog for specific range', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
        },
        {
          id: 'job-003',
          status: 'completed',
          outputPath: '/path/3',
          completedAt: new Date('2024-01-30'),
          createdAt: new Date('2024-01-30'),
        },
      ]);

      const changelog = await manager.generateChangelog('dataset-001', 2, 3);

      expect(changelog).toContain('Changelog (v2..v3)');
      expect(changelog).toContain('## Version 2');
      expect(changelog).toContain('## Version 3');
      expect(changelog).not.toContain('## Version 1');
    });
  });

  describe('verifyVersionIntegrity', () => {
    it('should verify valid version', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          manifestPath: '/manifest/1.json',
          downloadUrls: ['url1'],
          deliveryResult: { manifestChecksum: 'hash123' },
        },
      ]);

      const result = await manager.verifyVersionIntegrity('dataset-001', 1);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.checksumValid).toBe(true);
    });

    it('should detect missing manifest', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          manifestPath: null,
          downloadUrls: ['url1'],
          deliveryResult: { manifestChecksum: 'hash123' },
        },
      ]);

      const result = await manager.verifyVersionIntegrity('dataset-001', 1);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing manifest path');
    });

    it('should detect missing download URLs', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          manifestPath: '/manifest/1.json',
          downloadUrls: [],
          deliveryResult: { manifestChecksum: 'hash123' },
        },
      ]);

      const result = await manager.verifyVersionIntegrity('dataset-001', 1);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing download URLs');
    });

    it('should return invalid for non-existent version', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);

      const result = await manager.verifyVersionIntegrity('dataset-001', 1);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Version not found');
    });
  });

  describe('getEvolutionStats', () => {
    it('should calculate evolution for multiple versions', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          compilationResult: { totalRecords: 100 },
          deliveryResult: { totalBytes: 1000000 },
        },
        {
          id: 'job-002',
          status: 'completed',
          outputPath: '/path/2',
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
          compilationResult: { totalRecords: 300 },
          deliveryResult: { totalBytes: 3000000 },
        },
      ]);

      const stats = await manager.getEvolutionStats('dataset-001');

      expect(stats.totalGrowthRecords).toBe(200); // 300 - 100
      expect(stats.totalGrowthBytes).toBe(2000000); // 3000000 - 1000000
      expect(stats.averageVersionSize).toBe(2000000); // (1000000 + 3000000) / 2
    });

    it('should handle single version', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([
        {
          id: 'job-001',
          status: 'completed',
          outputPath: '/path/1',
          completedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
          compilationResult: { totalRecords: 100 },
          deliveryResult: { totalBytes: 1000000 },
        },
      ]);

      const stats = await manager.getEvolutionStats('dataset-001');

      expect(stats.totalGrowthRecords).toBe(0);
      expect(stats.totalGrowthBytes).toBe(0);
      expect(stats.averageVersionSize).toBe(1000000);
    });

    it('should calculate version frequency', async () => {
      // Daily frequency (> 0.5 per day)
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: `job-${i}`,
          status: 'completed',
          outputPath: `/path/${i}`,
          createdAt: new Date(`2024-01-${i + 1}`),
          completedAt: new Date(`2024-01-${i + 1}`),
          deliveryResult: { totalBytes: 1000000 },
        }))
      );

      const stats = await manager.getEvolutionStats('dataset-001');

      expect(stats.versionFrequency).toBe('daily');
    });

    it('should handle empty dataset', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);

      const stats = await manager.getEvolutionStats('dataset-001');

      expect(stats.totalGrowthRecords).toBe(0);
      expect(stats.totalGrowthBytes).toBe(0);
      expect(stats.averageVersionSize).toBe(0);
      expect(stats.versionFrequency).toBe('rare');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const m1 = getVersionManager();
      const m2 = getVersionManager();

      expect(m1).toBe(m2);
    });

    it('should create new instance after reset', () => {
      const m1 = getVersionManager();
      resetVersionManager();
      const m2 = getVersionManager();

      expect(m1).not.toBe(m2);
    });
  });
});
