import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import { PretrainingPipeline, buildPretrainingConfig, PretrainingRecord } from '../pre-training/pretraining-pipeline';
import path from 'path';
import fs from 'fs/promises';

interface MdsRecord {
  text: string;
  token_count?: number;
  document_count?: number;
  document_ids?: string[];
}

export class PretrainMdsCompiler implements Compiler {
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;
  private pipeline: PretrainingPipeline;

  constructor() {
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
    this.pipeline = new PretrainingPipeline();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);
    const pipelineConfig = buildPretrainingConfig(config);
    const pipelineInput: PretrainingRecord[] = records.map((record) => ({
      id: record.id,
      text: record.content,
    }));

    const pipelineResult = this.pipeline.process(pipelineInput, pipelineConfig);

    const outputDir = `/tmp/preparation/${datasetId}`;
    await fs.mkdir(outputDir, { recursive: true });

    const shardSizeMb = config.shard_size_mb ?? 100;
    const shardSizeBytes = shardSizeMb * 1024 * 1024;

    const shards: Array<{ path: string; sizeBytes: number; samples: number }> = [];
    let currentShard: MdsRecord[] = [];
    let currentSize = 0;
    let shardIndex = 0;

    for (const sequence of pipelineResult.sequences) {
      const entry: MdsRecord = {
        text: sequence.text,
        token_count: sequence.tokenCount,
        document_count: sequence.documentCount,
        document_ids: sequence.documentIds,
      };
      const entrySize = Buffer.byteLength(JSON.stringify(entry));

      if (currentSize + entrySize > shardSizeBytes && currentShard.length > 0) {
        const shardPath = path.join(outputDir, `shard.${shardIndex.toString().padStart(5, '0')}.mds`);
        await this.writer.write(shardPath, currentShard);
        shards.push({ path: shardPath, sizeBytes: currentSize, samples: currentShard.length });

        currentShard = [];
        currentSize = 0;
        shardIndex++;
      }

      currentShard.push(entry);
      currentSize += entrySize;
    }

    if (currentShard.length > 0) {
      const shardPath = path.join(outputDir, `shard.${shardIndex.toString().padStart(5, '0')}.mds`);
      await this.writer.write(shardPath, currentShard);
      shards.push({ path: shardPath, sizeBytes: currentSize, samples: currentShard.length });
    }

    const indexPath = path.join(outputDir, 'index.json');
    const index = {
      shards: shards.map((s) => ({
        column_encodings: ['str', 'int', 'int', 'json'],
        column_names: ['text', 'token_count', 'document_count', 'document_ids'],
        column_sizes: [s.sizeBytes, 4, 4, 100],
        compression: null,
        format: 'mds',
        hashes: [],
        raw_data: { basename: path.basename(s.path), bytes: s.sizeBytes },
        samples: s.samples,
        size_limit: shardSizeBytes,
        version: 2,
      })),
      metadata: {
        totalSequences: pipelineResult.stats.totalSequences,
        totalTokens: pipelineResult.stats.totalTokens,
        totalDocuments: pipelineResult.stats.totalDocuments,
        deduplicatedCount: pipelineResult.stats.deduplicatedCount,
        qualityFilteredCount: pipelineResult.stats.qualityFilteredCount,
        packingEfficiency: pipelineResult.stats.packingEfficiency,
      },
    };
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

    return {
      shardCount: shards.length,
      totalSizeBytes: shards.reduce((sum, s) => sum + s.sizeBytes, 0),
      outputPaths: [...shards.map(s => s.path), indexPath],
      recordCount: pipelineResult.stats.totalSequences,
      format: 'mds',
      stats: {
        pretraining: pipelineResult.stats,
      },
    };
  }
}
