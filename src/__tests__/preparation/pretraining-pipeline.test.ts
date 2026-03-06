import { describe, it, expect } from 'vitest';
import { PretrainingPipeline, buildPretrainingConfig, PretrainingRecord } from '@/lib/preparation/compile/pre-training/pretraining-pipeline';
import { PreparationConfig } from '@/lib/preparation/preparation.types';

describe('PretrainingPipeline', () => {
  const pipeline = new PretrainingPipeline();

  const sampleRecords: PretrainingRecord[] = [
    { id: 'a', text: 'Patient presents with fever and cough. Treatment started.' },
    { id: 'b', text: 'Patient presents with fever and cough. Treatment started.' },
    { id: 'c', text: 'Short' },
    { id: 'd', text: 'Clinical note describing diagnosis and follow up instructions.' },
  ];

  it('deduplicates repeated documents', () => {
    const result = pipeline.process(sampleRecords, { deduplicate: true, qualityThreshold: 0 });
    expect(result.stats.deduplicatedCount).toBe(1);
    expect(result.stats.keptDocuments).toBe(3);
  });

  it('filters low-quality documents using threshold', () => {
    const result = pipeline.process(sampleRecords, { deduplicate: false, qualityThreshold: 0.5 });
    expect(result.stats.qualityFilteredCount).toBeGreaterThan(0);
    expect(result.stats.keptDocuments).toBeGreaterThan(0);
    expect(result.stats.keptDocuments).toBeLessThan(sampleRecords.length);
  });

  it('packs documents into sequences with deterministic order', () => {
    const resultA = pipeline.process(sampleRecords, { maxTokens: 32, seed: 123 });
    const resultB = pipeline.process(sampleRecords, { maxTokens: 32, seed: 123 });

    expect(resultA.stats.totalSequences).toBeGreaterThan(0);
    expect(resultA.stats.totalSequences).toBe(resultB.stats.totalSequences);
    expect(resultA.sequences.map((seq) => seq.id)).toEqual(resultB.sequences.map((seq) => seq.id));
  });

  it('respects EOS token configuration', () => {
    const result = pipeline.process(sampleRecords.slice(0, 2), {
      maxTokens: 64,
      addEosToken: true,
      eosToken: '<eos>',
    });

    expect(result.sequences[0].text).toContain('<eos>');
  });

  it('handles empty datasets gracefully', () => {
    const result = pipeline.process([], {});
    expect(result.stats.totalDocuments).toBe(0);
    expect(result.sequences).toHaveLength(0);
  });

  it('buildPretrainingConfig maps PreparationConfig fields', () => {
    const config: PreparationConfig = {
      deduplicate: false,
      quality_threshold: 0.9,
      max_tokens: 1024,
      seed: 7,
      add_eos_token: false,
      eos_token: '<end>',
      separator: '\n---\n',
    };

    const pipelineConfig = buildPretrainingConfig(config);
    expect(pipelineConfig.deduplicate).toBe(false);
    expect(pipelineConfig.qualityThreshold).toBe(0.9);
    expect(pipelineConfig.maxTokens).toBe(1024);
    expect(pipelineConfig.seed).toBe(7);
    expect(pipelineConfig.addEosToken).toBe(false);
    expect(pipelineConfig.eosToken).toBe('<end>');
    expect(pipelineConfig.separator).toBe('\n---\n');
  });
});
