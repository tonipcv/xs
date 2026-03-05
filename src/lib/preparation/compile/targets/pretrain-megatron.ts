import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import fs from 'fs/promises';
import path from 'path';

export class PretrainMegatronCompiler implements Compiler {
  private adapter: DatasetAdapter;

  constructor() {
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const outputDir = `/tmp/preparation/${datasetId}`;
    await fs.mkdir(outputDir, { recursive: true });

    const binPath = path.join(outputDir, 'dataset.bin');
    const idxPath = path.join(outputDir, 'dataset.idx');

    const textData = records.map(r => r.content + '\n').join('');
    const buffer = Buffer.from(textData, 'utf-8');

    await fs.writeFile(binPath, buffer);

    const index = {
      version: 1,
      dtype: 'uint8',
      sizes: [buffer.length],
      doc_idx: records.map((_, i) => i),
    };
    await fs.writeFile(idxPath, JSON.stringify(index, null, 2));

    return {
      shardCount: 1,
      totalSizeBytes: buffer.length,
      outputPaths: [binPath, idxPath],
    };
  }
}
