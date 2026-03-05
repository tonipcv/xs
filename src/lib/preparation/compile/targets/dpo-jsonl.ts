import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import fs from 'fs/promises';

export class DpoJsonlCompiler implements Compiler {
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const formatted = records.map((record) => this.formatDpoPair(record.content));

    const outputDir = `/tmp/preparation/${datasetId}`;
    const outputPath = path.join(outputDir, 'dpo-dataset.jsonl');

    await this.writer.write(outputPath, formatted);

    const totalSize = Buffer.byteLength(JSON.stringify(formatted));

    return {
      shardCount: 1,
      totalSizeBytes: totalSize,
      outputPaths: [outputPath],
    };
  }

  private formatDpoPair(content: any) {
    if (content && typeof content === 'object') {
      const { prompt, completion, chosen, rejected } = content as Record<string, any>
      if (prompt && completion) {
        return { prompt, completion }
      }
      if (chosen && rejected) {
        return { prompt: chosen, completion: rejected }
      }
    }
    const text = typeof content === 'string' ? content : JSON.stringify(content)
    return { prompt: text, completion: '' }
  }
}
