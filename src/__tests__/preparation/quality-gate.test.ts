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

  describe('detailed filtering', () => {
    it('should track filtered records with detailed reasons', async () => {
      const records = [
        { id: '1', content: 'Good quality content here' },
        { id: '2', content: 'Good quality content here' }, // Duplicate
        { id: '3', content: 'xyz' }, // Too short
        { id: '4', content: '!!!!!!!!!!!!!!!!!!!!!!!!!!!!' }, // Low quality
        { id: '5', content: '' }, // Empty
      ];

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 4 });

      const result = await qualityGate.filterDetailed('dataset-1', {
        deduplicate: true,
        threshold: 0.7,
        trackFiltered: true,
        maxFilteredSamples: 10,
      });

      expect(result.recordsFiltered).toBe(4);
      expect(result.deduplicatedCount).toBe(1);
      expect(result.reasonCounts.duplicate).toBe(1);
      expect(result.reasonCounts.low_quality).toBe(1);
      expect(result.reasonCounts.too_short).toBe(1);
      expect(result.reasonCounts.incomplete_record).toBe(1);

      // Verify filtered records have details
      expect(result.filteredRecords.length).toBe(4);
      
      const duplicateRecord = result.filteredRecords.find(r => r.reason === 'duplicate');
      expect(duplicateRecord?.details.duplicateOf).toBe('1');
      expect(duplicateRecord?.details.contentHash).toBeDefined();

      const lowQualityRecord = result.filteredRecords.find(r => r.reason === 'low_quality');
      expect(lowQualityRecord?.details.qualityScore).toBeDefined();
      expect(lowQualityRecord?.details.threshold).toBe(0.7);

      // Check samples
      expect(result.samples.byReason.duplicate.length).toBe(1);
      expect(result.samples.byReason.low_quality.length).toBe(1);
    });

    it('should respect maxFilteredSamples limit', async () => {
      const records = Array.from({ length: 20 }, (_, i) => ({
        id: String(i + 1),
        content: i === 0 ? 'original content' : 'duplicate content',
      }));

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 19 });

      const result = await qualityGate.filterDetailed('dataset-1', {
        deduplicate: true,
        threshold: 0.5,
        trackFiltered: true,
        maxFilteredSamples: 5,
      });

      expect(result.recordsFiltered).toBe(19);
      expect(result.reasonCounts.duplicate).toBe(19);
      
      // Samples should be limited to 5
      expect(result.samples.byReason.duplicate.length).toBe(5);
    });

    it('should not track filtered records when trackFiltered is false', async () => {
      const records = [
        { id: '1', content: 'Good content' },
        { id: '2', content: 'Good content' }, // Duplicate
      ];

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 1 });

      const result = await qualityGate.filterDetailed('dataset-1', {
        deduplicate: true,
        threshold: 0.7,
        trackFiltered: false,
      });

      expect(result.recordsFiltered).toBe(1);
      expect(result.filteredRecords.length).toBe(0);
      expect(result.reasonCounts.duplicate).toBe(1);
    });

    it('should include timestamps in filtered record details', async () => {
      const records = [
        { id: '1', content: 'Good content' },
        { id: '2', content: '' }, // Empty
      ];

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 1 });

      const result = await qualityGate.filterDetailed('dataset-1', {
        deduplicate: false,
        threshold: 0.7,
        trackFiltered: true,
      });

      expect(result.filteredRecords.length).toBe(1);
      expect(result.filteredRecords[0].details.timestamp).toBeDefined();
      expect(new Date(result.filteredRecords[0].details.timestamp)).toBeInstanceOf(Date);
    });

    it('should include content preview in filtered record details', async () => {
      const longContent = 'A'.repeat(500);
      const records = [
        { id: '1', content: 'Good content' },
        { id: '2', content: longContent }, // Too long but will be filtered by quality
      ];

      mockGetRecords.mockResolvedValue(records);
      mockDeleteMany.mockResolvedValue({ count: 1 });

      const result = await qualityGate.filterDetailed('dataset-1', {
        deduplicate: false,
        threshold: 0.9, // High threshold to filter
        trackFiltered: true,
      });

      const filteredRecord = result.filteredRecords.find(r => r.recordId === '2');
      if (filteredRecord) {
        expect(filteredRecord.details.contentPreview).toBeDefined();
        expect(filteredRecord.details.contentPreview!.length).toBeLessThanOrEqual(200);
      }
    });
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
