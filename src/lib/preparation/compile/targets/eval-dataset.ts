import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { ParquetWriter } from '../formatters/parquet-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import fs from 'fs/promises';

export class EvalDatasetCompiler implements Compiler {
  private writer: ParquetWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.writer = new ParquetWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const splitRatios = config.split_ratios ?? { train: 0.8, val: 0.1, test: 0.1 };
    const splits = this.splitDataset(records, splitRatios);

    const outputDir = `/tmp/preparation/${datasetId}`;
    const outputPaths: string[] = [];

    for (const [splitName, splitRecords] of Object.entries(splits)) {
      const splitPath = path.join(outputDir, `${splitName}.parquet`);
      await this.writer.write(splitPath, splitRecords);
      outputPaths.push(splitPath);
    }

    const totalSize = records.length * 1024;

    return {
      shardCount: outputPaths.length,
      totalSizeBytes: totalSize,
      outputPaths,
    };
  }

  private splitDataset(
    records: Array<{ id: string; content: unknown; metadata: unknown }>,
    ratios: { train: number; val: number; test: number }
  ): Record<string, Array<{ id: string; content: unknown; metadata: unknown }>> {
    const shuffled = [...records].sort(() => Math.random() - 0.5);

    const trainEnd = Math.floor(shuffled.length * ratios.train);
    const valEnd = trainEnd + Math.floor(shuffled.length * ratios.val);

    return {
      train: shuffled.slice(0, trainEnd),
      val: shuffled.slice(trainEnd, valEnd),
      test: shuffled.slice(valEnd),
    };
  }
}
