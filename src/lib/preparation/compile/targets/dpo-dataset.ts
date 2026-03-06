import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { DPOFormatter } from '../dpo-formatter';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import fs from 'fs/promises';

export class DpoDatasetCompiler implements Compiler {
  private formatter: DPOFormatter;
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.formatter = new DPOFormatter();
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const dpoExamples = records.map(record => ({
      chosen: (record as any).chosen || (record as any).output,
      rejected: (record as any).rejected || (record as any).bad_output,
      prompt: (record as any).prompt || (record as any).input,
      context: (record as any).context,
    }));

    const { valid, invalid } = this.formatter.validateBatch(dpoExamples);

    console.log(`DPO validation: ${valid.length} valid, ${invalid.length} invalid`);

    if (invalid.length > 0) {
      console.warn('Invalid DPO examples:', invalid.slice(0, 5).map(i => i.errors));
    }

    const formatted = this.formatter.formatBatch(valid);

    const outputDir = `/tmp/preparation/${datasetId}`;
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, 'dpo-preferences.jsonl');
    await this.writer.write(outputPath, formatted);

    const stats = await fs.stat(outputPath);

    return {
      shardCount: 1,
      totalSizeBytes: stats.size,
      outputPaths: [outputPath],
      recordCount: valid.length,
      format: 'jsonl',
    };
  }
}
