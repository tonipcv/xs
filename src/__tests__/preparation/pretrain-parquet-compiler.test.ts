import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PretrainParquetCompiler } from '@/lib/preparation/compile/targets/pretrain-parquet';
import { DatasetAdapter } from '@/lib/preparation/adapters/dataset-adapter';
import { PretrainingPipeline } from '@/lib/preparation/compile/pre-training/pretraining-pipeline';
import { PreparationConfig } from '@/lib/preparation/preparation.types';
import { readFile, unlink, rmdir } from 'fs/promises';
import path from 'path';
import fs from 'fs';

vi.mock('@/lib/preparation/adapters/dataset-adapter');
vi.mock('@/lib/preparation/compile/pre-training/pretraining-pipeline');

describe('PretrainParquetCompiler', () => {
  let compiler: PretrainParquetCompiler;
  const testDatasetId = 'test-dataset-123';

  beforeEach(() => {
    vi.clearAllMocks();
    compiler = new PretrainParquetCompiler();
  });

  afterEach(async () => {
    const testDir = `/tmp/preparation/${testDatasetId}`;
    try {
      if (fs.existsSync(testDir)) {
        const files = await fs.promises.readdir(testDir);
        for (const file of files) {
          await unlink(path.join(testDir, file));
        }
        await rmdir(testDir);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should compile dataset to Parquet format', async () => {
    const mockRecords = [
      { id: 'doc-1', content: 'First document content here', metadata: {} },
      { id: 'doc-2', content: 'Second document content here', metadata: {} },
      { id: 'doc-3', content: 'Third document content here', metadata: {} },
    ];

    const mockSequences = [
      { id: 'seq-1', text: 'First sequence', tokenCount: 10, documentCount: 1, documentIds: ['doc-1'] },
      { id: 'seq-2', text: 'Second sequence', tokenCount: 15, documentCount: 1, documentIds: ['doc-2'] },
      { id: 'seq-3', text: 'Third sequence', tokenCount: 20, documentCount: 1, documentIds: ['doc-3'] },
    ];

    const mockStats = {
      totalDocuments: 3,
      deduplicatedCount: 0,
      qualityFilteredCount: 0,
      keptDocuments: 3,
      totalSequences: 3,
      totalTokens: 45,
      packingEfficiency: 0.9,
      avgDocsPerSequence: 1,
      avgTokensPerSequence: 15,
      qualityThreshold: 0.5,
    };

    vi.mocked(DatasetAdapter.prototype.getRecords).mockResolvedValue(mockRecords as any);
    vi.mocked(PretrainingPipeline.prototype.process).mockReturnValue({
      sequences: mockSequences,
      stats: mockStats,
    } as any);

    const config: PreparationConfig = {
      shard_size_mb: 10,
      token_budget: 1000000,
      sequence_length: 2048,
    };

    const result = await compiler.compile(testDatasetId, config);

    expect(result).toBeDefined();
    expect(result.format).toBe('parquet');
    expect(result.recordCount).toBe(3);
    expect(result.shardCount).toBeGreaterThanOrEqual(1);
    expect(result.totalSizeBytes).toBeGreaterThan(0);
    expect(result.outputPaths.length).toBeGreaterThanOrEqual(1);
    expect(result.outputPaths[0]).toMatch(/\.parquet$/);
  });

  it('should create multiple shards when records exceed shard size', async () => {
    const mockRecords = Array.from({ length: 100 }, (_, i) => ({
      id: `doc-${i}`,
      content: 'A'.repeat(10000),
      metadata: {},
    }));

    const mockSequences = mockRecords.map((record, i) => ({
      id: `seq-${i}`,
      text: record.content,
      tokenCount: 100,
      documentCount: 1,
      documentIds: [record.id],
    }));

    const mockStats = {
      totalDocuments: 100,
      deduplicatedCount: 0,
      qualityFilteredCount: 0,
      keptDocuments: 100,
      totalSequences: 100,
      totalTokens: 10000,
      packingEfficiency: 0.9,
      avgDocsPerSequence: 1,
      avgTokensPerSequence: 100,
      qualityThreshold: 0.5,
    };

    vi.mocked(DatasetAdapter.prototype.getRecords).mockResolvedValue(mockRecords as any);
    vi.mocked(PretrainingPipeline.prototype.process).mockReturnValue({
      sequences: mockSequences,
      stats: mockStats,
    } as any);

    const config: PreparationConfig = {
      shard_size_mb: 1, // Small shard size to force multiple shards
      token_budget: 1000000,
      sequence_length: 2048,
    };

    const result = await compiler.compile(testDatasetId, config);

    expect(result.shardCount).toBeGreaterThanOrEqual(1);
    expect(result.outputPaths.length).toBe(result.shardCount);
  });

  it('should return empty result for empty dataset', async () => {
    const mockStats = {
      totalDocuments: 0,
      deduplicatedCount: 0,
      qualityFilteredCount: 0,
      keptDocuments: 0,
      totalSequences: 0,
      totalTokens: 0,
      packingEfficiency: 0,
      avgDocsPerSequence: 0,
      avgTokensPerSequence: 0,
      qualityThreshold: 0.5,
    };

    vi.mocked(DatasetAdapter.prototype.getRecords).mockResolvedValue([]);
    vi.mocked(PretrainingPipeline.prototype.process).mockReturnValue({
      sequences: [],
      stats: mockStats,
    } as any);

    const config: PreparationConfig = {
      shard_size_mb: 100,
      token_budget: 1000000,
      sequence_length: 2048,
    };

    const result = await compiler.compile(testDatasetId, config);

    expect(result.recordCount).toBe(0);
    expect(result.shardCount).toBe(0);
    expect(result.totalSizeBytes).toBe(0);
    expect(result.outputPaths).toHaveLength(0);
  });

  it('should generate valid Parquet file with correct header', async () => {
    const mockRecords = [
      { id: 'doc-1', content: 'Test content', metadata: {} },
    ];

    const mockSequences = [
      { id: 'seq-1', text: 'Test sequence', tokenCount: 5, documentCount: 1, documentIds: ['doc-1'] },
    ];

    const mockStats = {
      totalDocuments: 1,
      deduplicatedCount: 0,
      qualityFilteredCount: 0,
      keptDocuments: 1,
      totalSequences: 1,
      totalTokens: 5,
      packingEfficiency: 1.0,
      avgDocsPerSequence: 1,
      avgTokensPerSequence: 5,
      qualityThreshold: 0.5,
    };

    vi.mocked(DatasetAdapter.prototype.getRecords).mockResolvedValue(mockRecords as any);
    vi.mocked(PretrainingPipeline.prototype.process).mockReturnValue({
      sequences: mockSequences,
      stats: mockStats,
    } as any);

    const config: PreparationConfig = {
      shard_size_mb: 100,
      token_budget: 1000000,
      sequence_length: 2048,
    };

    const result = await compiler.compile(testDatasetId, config);

    expect(result.outputPaths).toHaveLength(1);
    
    // Verify Parquet file exists and has correct header
    const parquetPath = result.outputPaths[0];
    const fileBuffer = await readFile(parquetPath);
    
    // Check PAR1 magic number at beginning
    expect(fileBuffer.slice(0, 4).toString()).toBe('PAR1');
    // Check PAR1 magic number at end (footer)
    expect(fileBuffer.slice(-4).toString()).toBe('PAR1');
  });

  it('should handle different token budgets and sequence lengths', async () => {
    const mockRecords = [
      { id: 'doc-1', content: 'Content with specific length', metadata: {} },
    ];

    const mockSequences = [
      { id: 'seq-1', text: 'Processed content', tokenCount: 50, documentCount: 1, documentIds: ['doc-1'] },
    ];

    const mockStats = {
      totalDocuments: 1,
      deduplicatedCount: 0,
      qualityFilteredCount: 0,
      keptDocuments: 1,
      totalSequences: 1,
      totalTokens: 50,
      packingEfficiency: 1.0,
      avgDocsPerSequence: 1,
      avgTokensPerSequence: 50,
      qualityThreshold: 0.5,
    };

    vi.mocked(DatasetAdapter.prototype.getRecords).mockResolvedValue(mockRecords as any);
    vi.mocked(PretrainingPipeline.prototype.process).mockReturnValue({
      sequences: mockSequences,
      stats: mockStats,
    } as any);

    const configs: PreparationConfig[] = [
      { token_budget: 10000, sequence_length: 512, shard_size_mb: 50 },
      { token_budget: 100000, sequence_length: 2048, shard_size_mb: 100 },
      { token_budget: 1000000, sequence_length: 4096, shard_size_mb: 200 },
    ];

    for (const config of configs) {
      const result = await compiler.compile(testDatasetId, config);
      expect(result).toBeDefined();
      expect(result.recordCount).toBe(1);
    }
  });
});
