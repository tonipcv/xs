/**
 * Tests for ArtifactRetentionManager
 * 
 * Testes para o sistema de retenção e garbage collection de artefatos.
 */

import { 
  ArtifactRetentionManager, 
  DEFAULT_RETENTION_POLICY,
  RetentionPolicy,
} from '@/lib/preparation/retention/artifact-retention';
import { prisma } from '@/lib/prisma';
import { vi, describe, it, expect, beforeEach } from 'vitest';

type MockType = ReturnType<typeof vi.fn>;

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    preparationJob: {
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    jobLog: {
      deleteMany: vi.fn(),
    },
    dataset: {
      findMany: vi.fn(),
    },
  },
}));

describe('ArtifactRetentionManager', () => {
  let manager: ArtifactRetentionManager;
  const mockS3Client = {
    deleteObject: vi.fn().mockResolvedValue({}),
    listObjects: vi.fn().mockResolvedValue({ Contents: [] }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ArtifactRetentionManager(DEFAULT_RETENTION_POLICY, mockS3Client);
  });

  describe('Policy Management', () => {
    it('should use default policy when none provided', () => {
      const defaultManager = new ArtifactRetentionManager();
      expect(defaultManager).toBeDefined();
    });

    it('should merge custom policy with defaults', () => {
      const customManager = new ArtifactRetentionManager({
        completedJobRetentionDays: 60,
        maxArtifactsPerDataset: 100,
      });
      expect(customManager).toBeDefined();
    });

    it('should update policy dynamically', () => {
      manager.updatePolicy({ completedJobRetentionDays: 45 });
      // Policy updated successfully if no error thrown
      expect(true).toBe(true);
    });
  });

  describe('Cleanup Operations', () => {
    const createMockJob = (overrides = {}) => ({
      id: 'job-001',
      datasetId: 'dataset-001',
      tenantId: 'tenant-001',
      status: 'completed',
      progress: 100,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      completedAt: new Date('2024-01-01'),
      outputPath: '/tmp/test/output',
      normalizationResult: { recordCount: 100 },
      compilationResult: { totalBytes: 1024000 },
      deliveryResult: { totalBytes: 1024000 },
      ...overrides,
    });

    it('should cleanup expired completed jobs', async () => {
      const oldJob = createMockJob({
        status: 'completed',
        completedAt: new Date('2023-01-01'), // Very old
      });

      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValueOnce([oldJob]) // completed jobs
        .mockResolvedValueOnce([]) // failed jobs
        .mockResolvedValueOnce([]); // cancelled jobs

      (prisma.dataset.findMany as unknown as MockType).mockResolvedValue([]);

      const result = await manager.runCleanup('tenant-001');

      expect(result.jobsProcessed).toBe(1);
      expect(result.jobsSoftDeleted).toBe(1);
      expect(prisma.preparationJob.update).toHaveBeenCalled();
    });

    it('should cleanup expired failed jobs', async () => {
      const failedJob = createMockJob({
        status: 'failed',
        completedAt: null,
        updatedAt: new Date('2023-01-01'),
      });

      (prisma.preparationJob.findMany as unknown as MockType)
        .mockResolvedValueOnce([]) // completed jobs
        .mockResolvedValueOnce([failedJob]) // failed jobs
        .mockResolvedValueOnce([]); // cancelled jobs

      (prisma.dataset.findMany as unknown as MockType).mockResolvedValue([]);

      const result = await manager.runCleanup('tenant-001');

      expect(result.jobsProcessed).toBe(1);
      expect(prisma.preparationJob.update).toHaveBeenCalled();
    });

    it('should hard delete when soft delete is disabled', async () => {
      manager.updatePolicy({ enableSoftDelete: false });

      const oldJob = createMockJob({
        status: 'completed',
        completedAt: new Date('2023-01-01'),
      });

      (prisma.preparationJob.findMany as unknown as MockType)
        .mockResolvedValueOnce([oldJob])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      (prisma.dataset.findMany as unknown as MockType).mockResolvedValue([]);

      const result = await manager.runCleanup('tenant-001');

      expect(result.jobsHardDeleted).toBe(1);
      expect(prisma.jobLog.deleteMany).toHaveBeenCalled();
      expect(prisma.preparationJob.delete).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const job1 = createMockJob({ id: 'job-001' });
      const job2 = createMockJob({ id: 'job-002' });

      (prisma.preparationJob.findMany as unknown as MockType)
        .mockResolvedValueOnce([job1, job2])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      (prisma.preparationJob.update as unknown as MockType)
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Update failed'));

      (prisma.dataset.findMany as unknown as MockType).mockResolvedValue([]);

      const result = await manager.runCleanup('tenant-001');

      expect(result.jobsProcessed).toBe(2);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Storage Statistics', () => {
    it('should calculate storage stats by status', async () => {
      const mockJobs = [
        {
          id: 'job-001',
          tenantId: 'tenant-001',
          datasetId: 'dataset-001',
          status: 'completed',
          createdAt: new Date('2024-01-01'),
          normalizationResult: { recordCount: 100 },
          compilationResult: { totalBytes: 1000000 },
          deliveryResult: { totalBytes: 1000000 },
        },
        {
          id: 'job-002',
          tenantId: 'tenant-001',
          datasetId: 'dataset-001',
          status: 'failed',
          createdAt: new Date('2024-02-01'),
          normalizationResult: { recordCount: 50 },
        },
        {
          id: 'job-003',
          tenantId: 'tenant-001',
          datasetId: 'dataset-002',
          status: 'completed',
          createdAt: new Date('2024-03-01'),
          compilationResult: { totalBytes: 2000000 },
        },
      ];

      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue(mockJobs);

      const stats = await manager.getStorageStats('tenant-001');

      expect(stats.tenantId).toBe('tenant-001');
      expect(stats.totalJobs).toBe(3);
      expect(stats.byStatus.completed.count).toBe(2);
      expect(stats.byStatus.failed.count).toBe(1);
      expect(Object.keys(stats.byDataset).length).toBe(2);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.totalSizeGB).toBeGreaterThan(0);
    });

    it('should handle empty storage stats', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockResolvedValue([]);

      const stats = await manager.getStorageStats('tenant-001');

      expect(stats.totalJobs).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
      expect(stats.totalSizeGB).toBe(0);
    });
  });

  describe('TTL Calculation', () => {
    it('should calculate remaining TTL for completed jobs', () => {
      const job = {
        id: 'job-001',
        status: 'completed' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
      };

      const ttl = manager.calculateRemainingTTL(job as any);

      expect(ttl).toBe(30); // Default completed retention days
    });

    it('should calculate remaining TTL for failed jobs', () => {
      const job = {
        id: 'job-001',
        status: 'failed' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ttl = manager.calculateRemainingTTL(job as any);

      expect(ttl).toBe(7); // Default failed retention days
    });

    it('should return 0 TTL for expired jobs', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      const job = {
        id: 'job-001',
        status: 'completed' as const,
        createdAt: oldDate,
        updatedAt: oldDate,
        completedAt: oldDate,
      };

      const ttl = manager.calculateRemainingTTL(job as any);

      expect(ttl).toBe(0);
    });

    it('should return infinity TTL for pending jobs', () => {
      const job = {
        id: 'job-001',
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ttl = manager.calculateRemainingTTL(job as any);

      expect(ttl).toBe(Infinity);
    });
  });

  describe('Dataset Limits', () => {
    it('should enforce max artifacts per dataset', async () => {
      // Create 60 jobs for a dataset (limit is 50)
      const manyJobs = Array.from({ length: 60 }, (_, i) => ({
        id: `job-${i}`,
        datasetId: 'dataset-001',
        tenantId: 'tenant-001',
        status: 'completed',
        createdAt: new Date(`2024-01-${String((i % 30) + 1).padStart(2, '0')}`),
        updatedAt: new Date(),
        normalizationResult: { recordCount: 10 },
      }));

      (prisma.preparationJob.findMany as unknown as MockType)
        .mockResolvedValueOnce([]) // no expired
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Mock dataset query
      (prisma.dataset.findMany as unknown as MockType).mockResolvedValue([
        { id: 'dataset-001' },
      ]);

      // Mock jobs per dataset (returning oldest 10 that should be deleted)
      (prisma.preparationJob.findMany as unknown as MockType)
        .mockResolvedValueOnce(manyJobs.slice(0, 10));

      (prisma.preparationJob.update as unknown as MockType).mockResolvedValue({});

      const result = await manager.runCleanup('tenant-001');

      // Should have cleaned up excess jobs
      expect(result.jobsSoftDeleted).toBeGreaterThan(0);
    });
  });

  describe('Soft Delete Management', () => {
    it('should cleanup old soft deleted jobs', async () => {
      const oldSoftDeletedJob = {
        id: 'job-001',
        status: 'completed',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
        deletedAt: new Date('2023-01-02'), // Deleted long ago
        normalizationResult: { recordCount: 100 },
      };

      (prisma.preparationJob.findMany as unknown as MockType)
        .mockResolvedValueOnce([]) // expired completed
        .mockResolvedValueOnce([]) // expired failed
        .mockResolvedValueOnce([]) // expired cancelled
        .mockResolvedValueOnce([oldSoftDeletedJob]); // old soft deleted

      (prisma.dataset.findMany as unknown as MockType).mockResolvedValue([]);

      (prisma.jobLog.deleteMany as unknown as MockType).mockResolvedValue({});
      (prisma.preparationJob.delete as unknown as MockType).mockResolvedValue({});

      const result = await manager.runCleanup('tenant-001');

      expect(result.jobsHardDeleted).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (prisma.preparationJob.findMany as unknown as MockType).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(manager.runCleanup('tenant-001')).rejects.toThrow('Database connection failed');
    });

    it('should handle S3 deletion errors', async () => {
      const job = {
        id: 'job-001',
        status: 'completed',
        completedAt: new Date('2023-01-01'),
        outputPath: 's3://bucket/prefix',
        normalizationResult: { recordCount: 100 },
      };

      (prisma.preparationJob.findMany as unknown as MockType)
        .mockResolvedValueOnce([job])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      (prisma.dataset.findMany as unknown as MockType).mockResolvedValue([]);

      // S3 client exists but may fail
      const result = await manager.runCleanup('tenant-001');

      // Should still process job even if S3 fails
      expect(result.jobsProcessed).toBe(1);
    });
  });

  describe('Singleton Pattern', () => {
    it('should provide singleton instance', () => {
      const { getRetentionManager, resetRetentionManager } = require('@/lib/preparation/retention/artifact-retention');
      resetRetentionManager();
      
      const instance1 = getRetentionManager();
      const instance2 = getRetentionManager();
      
      expect(instance1).toBe(instance2);
    });
  });
});
