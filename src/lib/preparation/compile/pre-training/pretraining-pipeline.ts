import crypto from 'crypto';
import { Document, SequencePacker } from './sequence-packer';
import { PreparationConfig } from '../../preparation.types';

export interface PretrainingPipelineConfig {
  deduplicate?: boolean;
  qualityThreshold?: number;
  maxTokens?: number;
  seed?: number;
  addEosToken?: boolean;
  eosToken?: string;
  separator?: string;
}

export function buildPretrainingConfig(config: PreparationConfig = {}): PretrainingPipelineConfig {
  return {
    deduplicate: config.deduplicate ?? true,
    qualityThreshold: config.quality_threshold ?? 0.5,
    maxTokens: config.max_tokens ?? 2048,
    seed: config.seed,
    addEosToken: config.add_eos_token,
    eosToken: config.eos_token,
    separator: config.separator,
  };
}

export interface PretrainingRecord {
  id: string;
  text: string;
}

export interface PretrainingStats {
  totalDocuments: number;
  deduplicatedCount: number;
  qualityFilteredCount: number;
  keptDocuments: number;
  totalSequences: number;
  totalTokens: number;
  packingEfficiency: number;
  avgDocsPerSequence: number;
  avgTokensPerSequence: number;
  qualityThreshold: number;
}

export interface PackedDocument extends Document {
  tokenCount: number;
  documentCount: number;
  documentIds: string[];
}

export interface PretrainingPipelineResult {
  sequences: PackedDocument[];
  stats: PretrainingStats;
}

export class PretrainingPipeline {
  process(records: PretrainingRecord[], config: PretrainingPipelineConfig = {}): PretrainingPipelineResult {
    const totalDocuments = records.length;
    if (totalDocuments === 0) {
      return {
        sequences: [],
        stats: {
          totalDocuments: 0,
          deduplicatedCount: 0,
          qualityFilteredCount: 0,
          keptDocuments: 0,
          totalSequences: 0,
          totalTokens: 0,
          packingEfficiency: 0,
          avgDocsPerSequence: 0,
          avgTokensPerSequence: 0,
          qualityThreshold: config.qualityThreshold ?? 0.5,
        },
      };
    }

    const deduplicate = config.deduplicate ?? true;
    const qualityThreshold = config.qualityThreshold ?? 0.5;
    const maxTokens = config.maxTokens ?? 2048;
    const seed = config.seed ?? 42;

    let working = [...records];
    let deduplicatedCount = 0;

    if (deduplicate) {
      const seen = new Set<string>();
      const unique: PretrainingRecord[] = [];
      for (const record of working) {
        const hash = this.hash(record.text);
        if (seen.has(hash)) {
          deduplicatedCount += 1;
          continue;
        }
        seen.add(hash);
        unique.push(record);
      }
      working = unique;
    }

    let qualityFilteredCount = 0;
    const qualityFiltered = working.filter((record) => {
      const score = this.calculateQualityScore(record.text);
      if (score < qualityThreshold) {
        qualityFilteredCount += 1;
        return false;
      }
      return true;
    });

    const documents: Document[] = qualityFiltered.map((record) => ({
      id: record.id,
      text: record.text,
    }));

    const packer = new SequencePacker({
      maxTokens,
      seed,
      addEosToken: config.addEosToken,
      eosToken: config.eosToken,
      separator: config.separator,
    });

    const packingResult = packer.pack(documents);

    const stats: PretrainingStats = {
      totalDocuments,
      deduplicatedCount,
      qualityFilteredCount,
      keptDocuments: qualityFiltered.length,
      totalSequences: packingResult.stats.totalSequences,
      totalTokens: packingResult.stats.totalTokens,
      packingEfficiency: packingResult.stats.packingEfficiency,
      avgDocsPerSequence: packingResult.stats.avgDocsPerSequence,
      avgTokensPerSequence: packingResult.stats.avgTokensPerSequence,
      qualityThreshold,
    };

    const sequences: PackedDocument[] = packingResult.sequences.map((sequence, index) => ({
      id: sequence.documentIds.join(',') || `sequence-${index}`,
      text: sequence.text,
      tokenCount: sequence.tokenCount,
      documentCount: sequence.documentCount,
      documentIds: sequence.documentIds,
    }));

    return {
      sequences,
      stats,
    };
  }

  private hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  private calculateQualityScore(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length < 10) return 0;

    let score = 1.0;

    const alphaChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
    const alphaRatio = alphaChars / trimmed.length;
    if (alphaRatio < 0.5) score -= 0.3;

    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const avgLineLength = trimmed.length / Math.max(1, lines.length);
    if (avgLineLength < 20) score -= 0.2;

    const uniqueChars = new Set(trimmed.toLowerCase()).size;
    if (uniqueChars < 10) score -= 0.2;

    return Math.max(0, score);
  }
}
