import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompilerRegistry } from '@/lib/preparation/compile/compiler-registry';
import { PretrainJsonlCompiler } from '@/lib/preparation/compile/targets/pretrain-jsonl';
import { PretrainMegatronCompiler } from '@/lib/preparation/compile/targets/pretrain-megatron';
import { PretrainMdsCompiler } from '@/lib/preparation/compile/targets/pretrain-mds';

const mockGetRecords = vi.fn();

vi.mock('@/lib/preparation/adapters/dataset-adapter', () => ({
  DatasetAdapter: class {
    getRecords = mockGetRecords;
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024 }),
  },
}));

describe('Pre-training Compilers Integration', () => {
  let registry: CompilerRegistry;

  beforeEach(() => {
    registry = new CompilerRegistry();
    mockGetRecords.mockReset();
  });

  describe('PretrainJsonlCompiler', () => {
    it('should compile with deduplication and quality filtering', async () => {
      const mockRecords = [
        { id: 'doc1', content: 'Patient presents with fever and cough. Treatment started.' },
        { id: 'doc2', content: 'Patient presents with fever and cough. Treatment started.' }, // Duplicate
        { id: 'doc3', content: 'Short' }, // Low quality
        { id: 'doc4', content: 'Clinical note describing diagnosis and follow up instructions.' },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('pre-training', 'text', 'hf');
      const result = await compiler.compile('dataset-1', {
        deduplicate: true,
        quality_threshold: 0.5,
        max_tokens: 1024,
        seed: 42,
      });

      expect(result.shardCount).toBeGreaterThan(0);
      expect(result.recordCount).toBeGreaterThan(0);
      expect(result.format).toBe('jsonl');
      expect(result.stats).toBeDefined();
      expect(result.stats?.pretraining).toBeDefined();
      
      const pretrainingStats = result.stats?.pretraining as any;
      expect(pretrainingStats.totalDocuments).toBe(4);
      expect(pretrainingStats.deduplicatedCount).toBe(1);
      expect(pretrainingStats.qualityFilteredCount).toBeGreaterThanOrEqual(0);
      expect(pretrainingStats.totalSequences).toBeGreaterThan(0);
    });

    it('should handle empty dataset', async () => {
      mockGetRecords.mockResolvedValue([]);

      const compiler = registry.getCompiler('pre-training', 'text', 'hf');
      const result = await compiler.compile('dataset-empty', {
        max_tokens: 512,
      });

      expect(result.shardCount).toBe(0);
      expect(result.recordCount).toBe(0);
      expect(result.stats?.pretraining).toBeDefined();
    });

    it('should respect max_tokens configuration', async () => {
      const longContent = 'A'.repeat(10000);
      const mockRecords = [
        { id: 'doc1', content: longContent },
        { id: 'doc2', content: longContent },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('pre-training', 'text', 'hf');
      const result = await compiler.compile('dataset-long', {
        max_tokens: 512,
        seed: 123,
      });

      expect(result.recordCount).toBeGreaterThan(0);
      expect(result.stats?.pretraining).toBeDefined();
    });

    it('should produce deterministic results with same seed', async () => {
      const mockRecords = [
        { id: 'doc1', content: 'First medical note about patient symptoms.' },
        { id: 'doc2', content: 'Second clinical observation and diagnosis.' },
        { id: 'doc3', content: 'Third patient record with treatment plan.' },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('pre-training', 'text', 'hf');
      
      const result1 = await compiler.compile('dataset-1', {
        max_tokens: 1024,
        seed: 42,
      });
      
      mockGetRecords.mockResolvedValue([...mockRecords]);
      const result2 = await compiler.compile('dataset-1', {
        max_tokens: 1024,
        seed: 42,
      });

      expect(result1.recordCount).toBe(result2.recordCount);
      expect(result1.stats?.pretraining).toEqual(result2.stats?.pretraining);
    });
  });

  describe('PretrainMegatronCompiler', () => {
    it('should compile to Megatron format with pipeline stats', async () => {
      const mockRecords = [
        { id: 'doc1', content: 'Medical record one with clinical details.' },
        { id: 'doc2', content: 'Medical record two with patient symptoms.' },
        { id: 'doc3', content: 'Medical record three with diagnosis.' },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('pre-training', 'text', 'megatron');
      const result = await compiler.compile('dataset-megatron', {
        deduplicate: false,
        quality_threshold: 0.3,
        max_tokens: 2048,
      });

      expect(result.shardCount).toBe(1);
      expect(result.recordCount).toBeGreaterThan(0);
      expect(result.format).toBe('megatron');
      expect(result.outputPaths).toHaveLength(2); // .bin and .idx
      expect(result.stats?.pretraining).toBeDefined();
      
      const pretrainingStats = result.stats?.pretraining as any;
      expect(pretrainingStats.totalDocuments).toBe(3);
      expect(pretrainingStats.totalSequences).toBeGreaterThan(0);
    });

    it('should handle empty dataset', async () => {
      mockGetRecords.mockResolvedValue([]);

      const compiler = registry.getCompiler('pre-training', 'text', 'megatron');
      const result = await compiler.compile('dataset-empty', {});

      expect(result.shardCount).toBe(1);
      expect(result.recordCount).toBe(0);
    });
  });

  describe('PretrainMdsCompiler', () => {
    it('should compile to MDS format with pipeline stats', async () => {
      const mockRecords = [
        { id: 'doc1', content: 'Clinical note one.' },
        { id: 'doc2', content: 'Clinical note two.' },
        { id: 'doc3', content: 'Clinical note three.' },
        { id: 'doc4', content: 'Clinical note four.' },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('pre-training', 'text', 'mosaic');
      const result = await compiler.compile('dataset-mds', {
        deduplicate: true,
        quality_threshold: 0.5,
        max_tokens: 1024,
        shard_size_mb: 10,
      });

      expect(result.shardCount).toBeGreaterThanOrEqual(0);
      expect(result.format).toBe('mds');
      expect(result.stats?.pretraining).toBeDefined();
      
      const pretrainingStats = result.stats?.pretraining as any;
      expect(pretrainingStats.totalDocuments).toBe(4);
    });

    it('should handle empty dataset', async () => {
      mockGetRecords.mockResolvedValue([]);

      const compiler = registry.getCompiler('pre-training', 'text', 'mosaic');
      const result = await compiler.compile('dataset-empty', {});

      expect(result.recordCount).toBe(0);
      expect(result.shardCount).toBe(0);
    });
  });

  describe('Compiler Selection', () => {
    it('should get correct compiler for pre-training:text:hf', () => {
      const compiler = registry.getCompiler('pre-training', 'text', 'hf');
      expect(compiler).toBeDefined();
      expect(compiler).toBeInstanceOf(PretrainJsonlCompiler);
    });

    it('should get correct compiler for pre-training:text:megatron', () => {
      const compiler = registry.getCompiler('pre-training', 'text', 'megatron');
      expect(compiler).toBeDefined();
      expect(compiler).toBeInstanceOf(PretrainMegatronCompiler);
    });

    it('should get correct compiler for pre-training:text:mosaic', () => {
      const compiler = registry.getCompiler('pre-training', 'text', 'mosaic');
      expect(compiler).toBeDefined();
      expect(compiler).toBeInstanceOf(PretrainMdsCompiler);
    });
  });

  describe('Configuration Mapping', () => {
    it('should map PreparationConfig to pipeline config', async () => {
      const mockRecords = [
        { id: 'doc1', content: 'Test content for configuration mapping.' },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('pre-training', 'text', 'hf');
      const result = await compiler.compile('dataset-config', {
        deduplicate: false,
        quality_threshold: 0.9,
        max_tokens: 512,
        seed: 123,
        add_eos_token: true,
        eos_token: '<eos>',
        separator: '\n---\n',
      });

      expect(result.stats?.pretraining).toBeDefined();
      const pretrainingStats = result.stats?.pretraining as any;
      expect(pretrainingStats.qualityThreshold).toBe(0.9);
    });
  });
});
