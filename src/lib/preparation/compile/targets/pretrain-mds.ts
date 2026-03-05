import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import fs from 'fs/promises';

export class PretrainMdsCompiler implements Compiler {
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const outputDir = `/tmp/preparation/${datasetId}`;
    await fs.mkdir(outputDir, { recursive: true });

    const shardSizeMb = config.shard_size_mb ?? 100;
    const shardSizeBytes = shardSizeMb * 1024 * 1024;

    const shards: Array<{ path: string; sizeBytes: number }> = [];
    let currentShard: Array<{ text: string }> = [];
    let currentSize = 0;
    let shardIndex = 0;

    for (const record of records) {
      const text = record.content;
      const entry = { text };
      const entrySize = Buffer.byteLength(JSON.stringify(entry));

      if (currentSize + entrySize > shardSizeBytes && currentShard.length > 0) {
        const shardPath = path.join(outputDir, `shard.${shardIndex.toString().padStart(5, '0')}.mds`);
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
      const shardPath = path.join(outputDir, `shard.${shardIndex.toString().padStart(5, '0')}.mds`);
      await this.writer.write(shardPath, currentShard);
      shards.push({ path: shardPath, sizeBytes: currentSize });
    }

    const indexPath = path.join(outputDir, 'index.json');
    const index = {
      shards: shards.map((s, i) => ({
        column_encodings: ['str'],
        column_names: ['text'],
        column_sizes: [s.sizeBytes],
        compression: null,
        format: 'mds',
        hashes: [],
        raw_data: { basename: path.basename(s.path), bytes: s.sizeBytes },
        samples: Math.floor(s.sizeBytes / 100),
        size_limit: shardSizeBytes,
        version: 2,
      })),
    };
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

    return {
      shardCount: shards.length,
      totalSizeBytes: shards.reduce((sum, s) => sum + s.sizeBytes, 0),
      outputPaths: [...shards.map(s => s.path), indexPath],
    };
  }
}
