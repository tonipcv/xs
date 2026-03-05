import { DatasetAdapter } from '../adapters/dataset-adapter';

export interface NormalizeResult {
  recordCount: number;
  normalizedRecords: Array<{ id: string; content: string }>;
}

export class TextNormalizer {
  private adapter: DatasetAdapter;

  constructor() {
    this.adapter = new DatasetAdapter();
  }

  async normalize(datasetId: string): Promise<NormalizeResult> {
    const records = await this.adapter.getRecords(datasetId);

    const normalizedRecords = records.map((record) => ({
      id: record.id,
      content: this.normalizeText(record.content),
    }));

    for (const normalized of normalizedRecords) {
      await this.adapter.updateRecord(normalized.id, normalized.content);
    }

    return {
      recordCount: normalizedRecords.length,
      normalizedRecords,
    };
  }

  private normalizeText(text: string): string {
    let normalized = text;

    normalized = normalized.normalize('NFC');
    normalized = normalized.replace(/\r\n/g, '\n');
    normalized = normalized.replace(/\r/g, '\n');
    normalized = normalized.replace(/\t/g, ' ');
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    normalized = normalized.replace(/\s+/g, ' ');
    normalized = normalized.trim();

    return normalized;
  }
}
