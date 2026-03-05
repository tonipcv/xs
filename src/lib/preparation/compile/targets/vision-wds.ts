import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { WebDatasetWriter } from '../formatters/webdataset-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';

export class VisionWdsCompiler implements Compiler {
  private writer: WebDatasetWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.writer = new WebDatasetWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecordsAsBuffers(datasetId);

    const outputDir = `/tmp/preparation/${datasetId}`;
    const shardSizeMb = config.shard_size_mb ?? 100;
    const shardSizeBytes = shardSizeMb * 1024 * 1024;

    const shards: Array<{ path: string; sizeBytes: number }> = [];
    let currentRecords: Array<{ key: string; data: Buffer; ext: string }> = [];
    let currentSize = 0;
    let shardIndex = 0;

    for (const record of records) {
      const imageData = record.data;
      const metadata = record.metadata as { label?: string };

      currentRecords.push({
        key: record.id,
        data: imageData,
        ext: 'jpg',
      });

      if (metadata?.label) {
        const labelData = Buffer.from(JSON.stringify({ label: metadata.label }));
        currentRecords.push({
          key: record.id,
          data: labelData,
          ext: 'json',
        });
      }

      currentSize += imageData.length;

      if (currentSize >= shardSizeBytes && currentRecords.length > 0) {
        const shardPath = path.join(outputDir, `shard-${shardIndex.toString().padStart(5, '0')}.tar`);
        await this.writer.write(shardPath, currentRecords);
        shards.push({ path: shardPath, sizeBytes: currentSize });

        currentRecords = [];
        currentSize = 0;
        shardIndex++;
      }
    }

    if (currentRecords.length > 0) {
      const shardPath = path.join(outputDir, `shard-${shardIndex.toString().padStart(5, '0')}.tar`);
      await this.writer.write(shardPath, currentRecords);
      shards.push({ path: shardPath, sizeBytes: currentSize });
    }

    return {
      shardCount: shards.length,
      totalSizeBytes: shards.reduce((sum, s) => sum + s.sizeBytes, 0),
      outputPaths: shards.map(s => s.path),
    };
  }
}
