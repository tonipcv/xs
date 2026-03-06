import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import { PretrainingPipeline, buildPretrainingConfig, PretrainingRecord } from '../pre-training/pretraining-pipeline';
import path from 'path';

interface SequenceRecord {
  id: string;
  text: string;
  token_count: number;
  document_count: number;
  document_ids: string[];
}

export class PretrainJsonlCompiler implements Compiler {
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
    const sequenceRecords: SequenceRecord[] = pipelineResult.sequences.map((sequence, index) => ({
      id: sequence.id || `sequence-${index}`,
      text: sequence.text,
      token_count: sequence.tokenCount,
      document_count: sequence.documentCount,
      document_ids: sequence.documentIds,
    }));

    const shardSizeMb = config.shard_size_mb ?? 100;
    const shardSizeBytes = shardSizeMb * 1024 * 1024;

    const outputDir = `/tmp/preparation/${datasetId}`;
    const shards = sequenceRecords.length
      ? await this.createShards(sequenceRecords, shardSizeBytes, outputDir)
      : [];

    return {
      shardCount: shards.length,
      totalSizeBytes: shards.reduce((sum, s) => sum + s.sizeBytes, 0),
      outputPaths: shards.map((s) => s.path),
      recordCount: sequenceRecords.length,
      format: 'jsonl',
      stats: {
        pretraining: pipelineResult.stats,
      },
    };
  }

  private async createShards(
    records: SequenceRecord[],
    shardSizeBytes: number,
    outputDir: string
  ): Promise<Array<{ path: string; sizeBytes: number }>> {
    const shards: Array<{ path: string; sizeBytes: number }> = [];
    let currentShard: SequenceRecord[] = [];
    let currentSize = 0;
    let shardIndex = 0;

    for (const record of records) {
      const entry = record;
      const entrySize = Buffer.byteLength(JSON.stringify(entry));

      if (currentSize + entrySize > shardSizeBytes && currentShard.length > 0) {
        const shardPath = path.join(outputDir, `shard-${shardIndex.toString().padStart(5, '0')}.jsonl`);
        await this.writer.write(shardPath, currentShard);
        shards.push({ path: shardPath, sizeBytes: currentSize });

        currentShard = [];
        currentSize = 0;
        shardIndex++;
      }

      currentShard.push(entry);
      currentSize += entrySize;
    }

    if (currentShard.length > 0) {
      const shardPath = path.join(outputDir, `shard-${shardIndex.toString().padStart(5, '0')}.jsonl`);
      await this.writer.write(shardPath, currentShard);
      shards.push({ path: shardPath, sizeBytes: currentSize });
    }

    return shards;
  }
}
