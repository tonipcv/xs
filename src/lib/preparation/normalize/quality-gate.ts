import { DatasetAdapter } from '../adapters/dataset-adapter';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface QualityConfig {
  deduplicate: boolean;
  threshold: number;
}

export interface QualityResult {
  recordsFiltered: number;
  deduplicatedCount: number;
}

export class QualityGate {
  private adapter: DatasetAdapter;

  constructor() {
    this.adapter = new DatasetAdapter();
  }

  async filter(datasetId: string, config: QualityConfig): Promise<QualityResult> {
    let recordsFiltered = 0;
    let deduplicatedCount = 0;

    if (config.deduplicate) {
      deduplicatedCount = await this.deduplicateRecords(datasetId);
      recordsFiltered += deduplicatedCount;
    }

    const qualityFiltered = await this.filterByQuality(datasetId, config.threshold);
    recordsFiltered += qualityFiltered;

    return { recordsFiltered, deduplicatedCount };
  }

  private async deduplicateRecords(datasetId: string): Promise<number> {
    const records = await this.adapter.getRecords(datasetId);

    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const record of records) {
      const hash = this.hashContent(record.content);
      if (seen.has(hash)) {
        duplicates.push(record.id);
      } else {
        seen.add(hash);
      }
    }

    if (duplicates.length > 0) {
      await prisma.dataAsset.deleteMany({
        where: { id: { in: duplicates } },
      });
    }

    return duplicates.length;
  }

  private async filterByQuality(datasetId: string, threshold: number): Promise<number> {
    const records = await this.adapter.getRecords(datasetId);

    const lowQuality: string[] = [];

    for (const record of records) {
      const score = this.calculateQualityScore(record.content);
      if (score < threshold) {
        lowQuality.push(record.id);
      }
    }

    if (lowQuality.length > 0) {
      await prisma.dataAsset.deleteMany({
        where: { id: { in: lowQuality } },
      });
    }

    return lowQuality.length;
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private calculateQualityScore(content: string): number {
    if (!content || content.length < 10) return 0;

    let score = 1.0;

    const alphaRatio = (content.match(/[a-zA-Z]/g) || []).length / content.length;
    if (alphaRatio < 0.5) score -= 0.3;

    const lines = content.split('\n');
    const avgLineLength = content.length / lines.length;
    if (avgLineLength < 20) score -= 0.2;

    const uniqueChars = new Set(content.toLowerCase()).size;
    if (uniqueChars < 10) score -= 0.2;

    return Math.max(0, score);
  }
}
