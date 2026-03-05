import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { WebDatasetWriter } from '../formatters/webdataset-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import crypto from 'crypto';

export class MultimodalWdsCompiler implements Compiler {
  private writer: WebDatasetWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.writer = new WebDatasetWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecordsAsBuffers(datasetId);

    const patientGroups = this.groupByPatient(records);

    const outputDir = `/tmp/preparation/${datasetId}`;
    const shardSizeMb = config.shard_size_mb ?? 100;
    const shardSizeBytes = shardSizeMb * 1024 * 1024;

    const shards: Array<{ path: string; sizeBytes: number }> = [];
    let currentRecords: Array<{ key: string; data: Buffer; ext: string }> = [];
    let currentSize = 0;
    let shardIndex = 0;

    for (const [patientToken, patientRecords] of Object.entries(patientGroups)) {
      const patientKey = this.generatePatientKey(patientToken);

      for (let i = 0; i < patientRecords.length; i++) {
        const record = patientRecords[i];
        const metadata = record.metadata as { modality?: string; timestamp?: string };
        const modality = metadata?.modality ?? 'text';

        const recordKey = `${patientKey}_${i.toString().padStart(4, '0')}`;
        const data = record.data;

        const ext = this.getExtensionForModality(modality);
        currentRecords.push({ key: recordKey, data, ext });

        const metadataBuffer = Buffer.from(JSON.stringify(metadata));
        currentRecords.push({ key: recordKey, data: metadataBuffer, ext: 'json' });

        currentSize += data.length + metadataBuffer.length;

        if (currentSize >= shardSizeBytes && currentRecords.length > 0) {
          const shardPath = path.join(outputDir, `shard-${shardIndex.toString().padStart(5, '0')}.tar`);
          await this.writer.write(shardPath, currentRecords);
          shards.push({ path: shardPath, sizeBytes: currentSize });

          currentRecords = [];
          currentSize = 0;
          shardIndex++;
        }
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

  private groupByPatient(records: Array<{ id: string; data: Buffer; metadata: Record<string, unknown> }>): Record<string, typeof records> {
    const groups: Record<string, typeof records> = {};

    for (const record of records) {
      const metadata = record.metadata as { patientToken?: string };
      const patientToken = metadata?.patientToken ?? 'unknown';

      if (!groups[patientToken]) {
        groups[patientToken] = [];
      }
      groups[patientToken].push(record);
    }

    return groups;
  }

  private generatePatientKey(patientToken: string): string {
    return crypto.createHash('sha256').update(patientToken).digest('hex').substring(0, 16);
  }

  private getExtensionForModality(modality: string): string {
    const extensions: Record<string, string> = {
      text: 'txt',
      image: 'jpg',
      audio: 'wav',
      dicom: 'dcm',
    };
    return extensions[modality] ?? 'bin';
  }
}
