import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import { PretrainingPipeline, buildPretrainingConfig, PretrainingRecord } from '../pre-training/pretraining-pipeline';
import fs from 'fs/promises';
import path from 'path';

export class PretrainMegatronCompiler implements Compiler {
  private adapter: DatasetAdapter;
  private pipeline: PretrainingPipeline;

  constructor() {
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

    const binPath = path.join(outputDir, 'dataset.bin');
    const idxPath = path.join(outputDir, 'dataset.idx');

    // Join sequences with newlines for Megatron format
    const textData = pipelineResult.sequences.map(s => s.text).join('\n');
    const buffer = Buffer.from(textData, 'utf-8');

    await fs.writeFile(binPath, buffer);

    const index = {
      version: 1,
      dtype: 'uint8',
      sizes: [buffer.length],
      doc_idx: pipelineResult.sequences.map((_, i) => i),
      metadata: {
        totalSequences: pipelineResult.stats.totalSequences,
        totalTokens: pipelineResult.stats.totalTokens,
        totalDocuments: pipelineResult.stats.totalDocuments,
        deduplicatedCount: pipelineResult.stats.deduplicatedCount,
        qualityFilteredCount: pipelineResult.stats.qualityFilteredCount,
        packingEfficiency: pipelineResult.stats.packingEfficiency,
      },
    };
    await fs.writeFile(idxPath, JSON.stringify(index, null, 2));

    return {
      shardCount: 1,
      totalSizeBytes: buffer.length,
      outputPaths: [binPath, idxPath],
      recordCount: pipelineResult.stats.totalSequences,
      format: 'megatron',
      stats: {
        pretraining: pipelineResult.stats,
      },
    };
  }
}
