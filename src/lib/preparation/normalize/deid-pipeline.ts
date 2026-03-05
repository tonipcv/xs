import { Modality } from '../preparation.types';
import { PIIDetector } from '@/lib/ingestion/pii-detector';
import { DatasetAdapter } from '../adapters/dataset-adapter';

export interface DeidResult {
  recordsRedacted: number;
  entitiesFound: number;
}

export class DeidPipeline {
  private piiDetector: PIIDetector;
  private adapter: DatasetAdapter;

  constructor() {
    this.piiDetector = new PIIDetector();
    this.adapter = new DatasetAdapter();
  }

  async apply(datasetId: string, modality: Modality): Promise<DeidResult> {
    let recordsRedacted = 0;
    let entitiesFound = 0;

    if (modality === 'text') {
      const result = await this.deidText(datasetId);
      recordsRedacted = result.recordsRedacted;
      entitiesFound = result.entitiesFound;
    } else if (modality === 'image') {
      const result = await this.deidImage(datasetId);
      recordsRedacted = result.recordsRedacted;
    } else if (modality === 'audio') {
      const result = await this.deidAudio(datasetId);
      recordsRedacted = result.recordsRedacted;
    }

    return { recordsRedacted, entitiesFound };
  }

  private async deidText(datasetId: string): Promise<DeidResult> {
    const records = await this.adapter.getRecords(datasetId);

    const dataArray = records.map(r => ({ content: r.content }));
    const scanResult = await this.piiDetector.scan(dataArray);

    if (scanResult.piiFieldsDetected > 0) {
      const maskedData = await this.piiDetector.maskData(dataArray);

      for (let i = 0; i < records.length; i++) {
        await this.adapter.updateRecord(records[i].id, maskedData[i].content);
      }

      return {
        recordsRedacted: scanResult.piiFieldsDetected,
        entitiesFound: scanResult.detections.length,
      };
    }

    return { recordsRedacted: 0, entitiesFound: 0 };
  }

  private async deidImage(datasetId: string): Promise<DeidResult> {
    return { recordsRedacted: 0, entitiesFound: 0 };
  }

  private async deidAudio(datasetId: string): Promise<DeidResult> {
    return { recordsRedacted: 0, entitiesFound: 0 };
  }
}
