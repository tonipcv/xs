import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/preparation/adapters/dataset-adapter', () => ({
  DatasetAdapter: class {
    getRecords = vi.fn();
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dataAsset: {
      deleteMany: vi.fn(),
    },
  },
}));

import { QualityGate } from '@/lib/preparation/normalize/quality-gate';
import { prisma } from '@/lib/prisma';

describe('QualityGate', () => {
  let qualityGate: QualityGate;
  let mockGetRecords: ReturnType<typeof vi.fn>;
  let mockDeleteMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    qualityGate = new QualityGate();
    mockGetRecords = (qualityGate as any).adapter.getRecords;
    mockDeleteMany = prisma.dataAsset.deleteMany as ReturnType<typeof vi.fn>;
    mockGetRecords.mockReset();
    mockDeleteMany.mockReset();
  });

  describe('deduplication', () => {
    it('should remove exact duplicate records', async () => {
      const records = [
        { id: '1', content: 'Hello world' },
        { id: '2', content: 'Hello world' },
        { id: '3', content: 'Different content' },
      ];

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 1 });

      const result = await qualityGate.filter('dataset-1', {
        deduplicate: true,
        threshold: 0,
      });

      expect(result.deduplicatedCount).toBe(1);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['2'] } },
      });
    });

    it('should not remove records when deduplicate is false', async () => {
      const records = [
        { id: '1', content: 'Hello world' },
        { id: '2', content: 'Hello world' },
      ];

      mockGetRecords.mockResolvedValue(records);

      const result = await qualityGate.filter('dataset-1', {
        deduplicate: false,
        threshold: 0,
      });

      expect(result.deduplicatedCount).toBe(0);
    });
  });

  describe('quality filtering', () => {
    it('should filter out low quality content', async () => {
      const records = [
        { id: '1', content: 'This is a good quality text with proper length and content.' },
        { id: '2', content: 'abc' }, // Too short
        { id: '3', content: '!!!!!!!!!!!!!!!!!!!!!!!!!!!!' }, // Low alpha ratio
      ];

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 2 });

      const result = await qualityGate.filter('dataset-1', {
        deduplicate: false,
        threshold: 0.7,
      });

      expect(result.recordsFiltered).toBe(2);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['2', '3'] } },
      });
    });

    it('should keep high quality content', async () => {
      const records = [
        { id: '1', content: 'This is a well-written medical note with proper documentation and clinical details.' },
        { id: '2', content: 'Patient presents with symptoms including fever and cough. Examination reveals normal vitals.' },
      ];

      mockGetRecords.mockResolvedValue(records);

      const result = await qualityGate.filter('dataset-1', {
        deduplicate: false,
        threshold: 0.7,
      });

      expect(result.recordsFiltered).toBe(0);
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    it('should handle empty content', async () => {
      const records = [
        { id: '1', content: '' },
        { id: '2', content: 'Valid content here' },
      ];

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 1 });

      const result = await qualityGate.filter('dataset-1', {
        deduplicate: false,
        threshold: 0.5,
      });

      expect(result.recordsFiltered).toBe(1);
    });
  });

  describe('combined filtering', () => {
    it('should apply both deduplication and quality filtering', async () => {
      const records = [
        { id: '1', content: 'Good quality content here' },
        { id: '2', content: 'Good quality content here' }, // Duplicate
        { id: '3', content: 'xyz' }, // Low quality
        { id: '4', content: 'Another good quality text with proper length' },
      ];

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 2 });

      const result = await qualityGate.filter('dataset-1', {
        deduplicate: true,
        threshold: 0.7,
      });

      expect(result.deduplicatedCount).toBe(1);
      expect(result.recordsFiltered).toBe(2); // 1 duplicate + 1 low quality
    });
  });
});
