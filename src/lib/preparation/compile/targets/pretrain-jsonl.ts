import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import { randomBytes } from 'crypto';

export class PretrainJsonlCompiler implements Compiler {
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const seed = config.seed ?? 42;
    const shuffled = this.shuffle(records, seed);

    const data = shuffled.map((r) => ({
      id: r.id,
      text: r.content,
    }));
    const shardSizeMb = config.shard_size_mb ?? 100;
    const shardSizeBytes = shardSizeMb * 1024 * 1024;

    const outputDir = `/tmp/preparation/${datasetId}`;
    const shards = await this.createShards(data, shardSizeBytes, outputDir);

    return {
      shardCount: shards.length,
      totalSizeBytes: shards.reduce((sum, s) => sum + s.sizeBytes, 0),
      outputPaths: shards.map((s) => s.path),
    };
  }

  private shuffle<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    let currentSeed = seed;

    for (let i = shuffled.length - 1; i > 0; i--) {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      const j = Math.floor((currentSeed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  // Backwards compatibility alias
  private shuffleArray<T>(array: T[], seed: number): T[] {
    return this.shuffle(array, seed)
  }

  private async createShards(
    records: Array<{ text: string }>,
    shardSizeBytes: number,
    outputDir: string
  ): Promise<Array<{ path: string; sizeBytes: number }>> {
    const shards: Array<{ path: string; sizeBytes: number }> = [];
    let currentShard: Array<{ text: string }> = [];
    let currentSize = 0;
    let shardIndex = 0;

    for (const record of records) {
      const entry = { text: record.text };
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
