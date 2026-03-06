import { describe, it, expect } from 'vitest';
import { SequencePacker, Document } from '@/lib/preparation/compile/pre-training/sequence-packer';

describe('SequencePacker', () => {
  const sampleDocs: Document[] = Array.from({ length: 5 }, (_, i) => ({
    id: `doc-${i + 1}`,
    text: `Document ${i + 1} text with some content.`,
  }));

  describe('constructor validation', () => {
    it('should throw if maxTokens is invalid', () => {
      expect(() => new SequencePacker({ maxTokens: 0 })).toThrow();
      expect(() => new SequencePacker({ maxTokens: -1 })).toThrow();
    });

    it('should set defaults', () => {
      const packer = new SequencePacker({ maxTokens: 100 });
      const result = packer.pack([]);
      expect(result.stats.totalDocuments).toBe(0);
    });
  });

  describe('packing behavior', () => {
    it('should pack documents respecting maxTokens', () => {
      const packer = new SequencePacker({ maxTokens: 50, seed: 1 });
      const result = packer.pack(sampleDocs);

      expect(result.sequences.length).toBeGreaterThan(0);
      expect(result.stats.totalDocuments).toBe(sampleDocs.length);
      result.sequences.forEach((seq) => {
        expect(seq.tokenCount).toBeLessThanOrEqual(50);
      });
    });

    it('should shuffle deterministically with same seed', () => {
      const packerA = new SequencePacker({ maxTokens: 40, seed: 42 });
      const packerB = new SequencePacker({ maxTokens: 40, seed: 42 });

      const resA = packerA.pack(sampleDocs);
      const resB = packerB.pack(sampleDocs);

      expect(resA.sequences.map((s) => s.documentIds)).toStrictEqual(resB.sequences.map((s) => s.documentIds));
    });

    it('should handle documents larger than maxTokens by splitting', () => {
      const largeDoc: Document = {
        id: 'large-doc',
        text: 'A'.repeat(1000),
      };

      const packer = new SequencePacker({ maxTokens: 50, seed: 1 });
      const result = packer.pack([largeDoc]);

      expect(result.sequences.length).toBeGreaterThan(1);
      result.sequences.forEach((seq) => {
        expect(seq.tokenCount).toBeLessThanOrEqual(50);
      });
    });

    it('should include EOS token when configured', () => {
      const packer = new SequencePacker({ maxTokens: 60, seed: 1, eosToken: '<eos>' });
      const result = packer.pack([{ id: 'a', text: 'hello world' }, { id: 'b', text: 'more text' }]);

      expect(result.sequences[0].text).toContain('<eos>');
    });

    it('should omit EOS token when disabled', () => {
      const packer = new SequencePacker({ maxTokens: 60, seed: 1, addEosToken: false });
      const result = packer.pack([{ id: 'a', text: 'hello world' }, { id: 'b', text: 'more text' }]);

      expect(result.sequences[0].text).not.toContain('<|endoftext|>');
    });
  });

  describe('statistics', () => {
    it('should compute correct stats', () => {
      const packer = new SequencePacker({ maxTokens: 80, seed: 10 });
      const result = packer.pack(sampleDocs);

      expect(result.stats.totalDocuments).toBe(sampleDocs.length);
      expect(result.stats.totalSequences).toBe(result.sequences.length);
      expect(result.stats.avgDocsPerSequence).toBeGreaterThan(0);
      expect(result.stats.packingEfficiency).toBeGreaterThan(0);
    });

    it('should handle empty input gracefully', () => {
      const packer = new SequencePacker({ maxTokens: 40 });
      const result = packer.pack([]);

      expect(result.sequences).toHaveLength(0);
      expect(result.stats.totalDocuments).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should skip invalid documents', () => {
      const packer = new SequencePacker({ maxTokens: 40 });
      const result = packer.pack([
        { id: 'valid', text: 'hello world' },
        { id: '', text: 'missing id' },
        { id: 'empty', text: '' },
      ]);

      expect(result.stats.totalDocuments).toBe(1);
    });

    it('should respect separator configuration', () => {
      const packer = new SequencePacker({ maxTokens: 80, separator: '\n---\n' });
      const result = packer.pack([{ id: '1', text: 'First' }, { id: '2', text: 'Second' }]);

      expect(result.sequences[0].text).toContain('\n---\n');
    });
  });
});
