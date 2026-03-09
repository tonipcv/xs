import { DatasetAdapter } from '../adapters/dataset-adapter';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface FilteredRecord {
  recordId: string;
  reason: FilterReason;
  details: {
    qualityScore?: number;
    threshold?: number;
    duplicateOf?: string;
    contentHash?: string;
    contentPreview?: string;
    timestamp: string;
  };
}

export type FilterReason = 
  | 'duplicate'
  | 'low_quality'
  | 'too_short'
  | 'too_long'
  | 'invalid_format'
  | 'pii_detected'
  | 'incomplete_record'
  | 'encoding_error';

export interface FilterReasonCounts {
  duplicate: number;
  low_quality: number;
  too_short: number;
  too_long: number;
  invalid_format: number;
  pii_detected: number;
  incomplete_record: number;
  encoding_error: number;
}

export interface DetailedQualityResult {
  recordsFiltered: number;
  deduplicatedCount: number;
  filteredRecords: FilteredRecord[];
  reasonCounts: FilterReasonCounts;
  samples: {
    byReason: Record<FilterReason, FilteredRecord[]>;
  };
}

export interface QualityConfig {
  deduplicate: boolean;
  threshold: number;
  trackFiltered?: boolean; // Enable detailed tracking
  maxFilteredSamples?: number; // Max samples to keep per reason (default: 10)
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

  async filterDetailed(datasetId: string, config: QualityConfig): Promise<DetailedQualityResult> {
    const maxSamples = config.maxFilteredSamples ?? 10;
    const filteredRecords: FilteredRecord[] = [];
    const samplesByReason: Record<FilterReason, FilteredRecord[]> = {
      duplicate: [],
      low_quality: [],
      too_short: [],
      too_long: [],
      invalid_format: [],
      pii_detected: [],
      incomplete_record: [],
      encoding_error: [],
    };

    const reasonCounts: FilterReasonCounts = {
      duplicate: 0,
      low_quality: 0,
      too_short: 0,
      too_long: 0,
      invalid_format: 0,
      pii_detected: 0,
      incomplete_record: 0,
      encoding_error: 0,
    };

    const records = await this.adapter.getRecords(datasetId);
    const seen = new Map<string, string>(); // hash -> recordId
    const duplicates: string[] = [];

    // Process each record
    for (const record of records) {
      const timestamp = new Date().toISOString();
      const contentPreview = record.content?.substring(0, 200) || '[empty]';

      // Check for duplicates
      if (config.deduplicate) {
        const hash = this.hashContent(record.content);
        if (seen.has(hash)) {
          const duplicateOf = seen.get(hash)!;
          duplicates.push(record.id);
          reasonCounts.duplicate++;

          const filtered: FilteredRecord = {
            recordId: record.id,
            reason: 'duplicate',
            details: {
              duplicateOf,
              contentHash: hash,
              contentPreview,
              timestamp,
            },
          };

          filteredRecords.push(filtered);
          if (samplesByReason.duplicate.length < maxSamples) {
            samplesByReason.duplicate.push(filtered);
          }
          continue;
        }
        seen.set(hash, record.id);
      }

      // Check quality threshold
      const qualityScore = this.calculateQualityScore(record.content);
      if (qualityScore < config.threshold) {
        reasonCounts.low_quality++;

        const filtered: FilteredRecord = {
          recordId: record.id,
          reason: 'low_quality',
          details: {
            qualityScore,
            threshold: config.threshold,
            contentPreview,
            timestamp,
          },
        };

        filteredRecords.push(filtered);
        if (samplesByReason.low_quality.length < maxSamples) {
          samplesByReason.low_quality.push(filtered);
        }
        continue;
      }

      // Check minimum length (too_short)
      if (record.content && record.content.length < 10) {
        reasonCounts.too_short++;

        const filtered: FilteredRecord = {
          recordId: record.id,
          reason: 'too_short',
          details: {
            contentPreview,
            timestamp,
          },
        };

        filteredRecords.push(filtered);
        if (samplesByReason.too_short.length < maxSamples) {
          samplesByReason.too_short.push(filtered);
        }
        continue;
      }

      // Check for invalid/empty content
      if (!record.content || record.content.trim().length === 0) {
        reasonCounts.incomplete_record++;

        const filtered: FilteredRecord = {
          recordId: record.id,
          reason: 'incomplete_record',
          details: {
            contentPreview: '[empty or whitespace]',
            timestamp,
          },
        };

        filteredRecords.push(filtered);
        if (samplesByReason.incomplete_record.length < maxSamples) {
          samplesByReason.incomplete_record.push(filtered);
        }
      }
    }

    // Delete filtered records from database
    const allFilteredIds = filteredRecords.map(r => r.recordId);
    if (allFilteredIds.length > 0) {
      await prisma.dataAsset.deleteMany({
        where: { id: { in: allFilteredIds } },
      });
    }

    return {
      recordsFiltered: filteredRecords.length,
      deduplicatedCount: reasonCounts.duplicate,
      filteredRecords: config.trackFiltered ? filteredRecords : [],
      reasonCounts,
      samples: {
        byReason: samplesByReason,
      },
    };
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
