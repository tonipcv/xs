import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { WebDatasetWriter } from '../formatters/webdataset-writer';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import fs from 'fs/promises';

export class AudioWdsCompiler implements Compiler {
  private wdsWriter: WebDatasetWriter;
  private jsonlWriter: JsonlWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.wdsWriter = new WebDatasetWriter();
    this.jsonlWriter = new JsonlWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecordsAsBuffers(datasetId);

    const outputDir = `/tmp/preparation/${datasetId}`;
    await fs.mkdir(outputDir, { recursive: true });

    const shardSizeMb = config.shard_size_mb ?? 100;
    const shardSizeBytes = shardSizeMb * 1024 * 1024;

    const shards: Array<{ path: string; sizeBytes: number }> = [];
    const manifest: Array<{ id: string; duration: number; transcript?: string }> = [];
    let currentRecords: Array<{ key: string; data: Buffer; ext: string }> = [];
    let currentSize = 0;
    let shardIndex = 0;

    for (const record of records) {
      const audioData = record.data;
      const metadata = record.metadata as { duration?: number; transcript?: string };

      currentRecords.push({
        key: record.id,
        data: audioData,
        ext: 'wav',
      });

      if (metadata?.transcript) {
        const transcriptData = Buffer.from(metadata.transcript);
        currentRecords.push({
          key: record.id,
          data: transcriptData,
          ext: 'txt',
        });
      }

      manifest.push({
        id: record.id,
        duration: metadata?.duration ?? 0,
        transcript: metadata?.transcript,
      });

      currentSize += audioData.length;

      if (currentSize >= shardSizeBytes && currentRecords.length > 0) {
        const shardPath = path.join(outputDir, `shard-${shardIndex.toString().padStart(5, '0')}.tar`);
        await this.wdsWriter.write(shardPath, currentRecords);
        shards.push({ path: shardPath, sizeBytes: currentSize });

        currentRecords = [];
        currentSize = 0;
        shardIndex++;
      }
    }

    if (currentRecords.length > 0) {
      const shardPath = path.join(outputDir, `shard-${shardIndex.toString().padStart(5, '0')}.tar`);
      await this.wdsWriter.write(shardPath, currentRecords);
      shards.push({ path: shardPath, sizeBytes: currentSize });
    }

    const manifestPath = path.join(outputDir, 'manifest.jsonl');
    await this.jsonlWriter.write(manifestPath, manifest);

    return {
      shardCount: shards.length,
      totalSizeBytes: shards.reduce((sum, s) => sum + s.sizeBytes, 0),
      outputPaths: [...shards.map(s => s.path), manifestPath],
    };
  }
}
