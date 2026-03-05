import { PreparationJob } from '../preparation.types';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

export class SidecarStreamer {
  async streamDataset(jobId: string, shardIndex: number): Promise<Readable> {
    const outputDir = `/tmp/preparation/${jobId}`;
    const shardPath = path.join(outputDir, `shard-${shardIndex.toString().padStart(5, '0')}.jsonl`);

    if (!fs.existsSync(shardPath)) {
      throw new Error(`Shard ${shardIndex} not found for job ${jobId}`);
    }

    return fs.createReadStream(shardPath);
  }

  async getShardCount(jobId: string): Promise<number> {
    const outputDir = `/tmp/preparation/${jobId}`;
    const files = await fs.promises.readdir(outputDir);
    return files.filter((f) => f.startsWith('shard-') && f.endsWith('.jsonl')).length;
  }
}
