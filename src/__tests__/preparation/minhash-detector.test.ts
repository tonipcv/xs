import { describe, it, expect, beforeEach } from 'vitest';
import { MinHashDetector, LSHIndex } from '@/lib/preparation/normalize/minhash-detector';

describe('MinHashDetector', () => {
  let detector: MinHashDetector;

  beforeEach(() => {
    detector = new MinHashDetector({
      numHashes: 64,
      shingleSize: 3,
      threshold: 0.7,
    });
  });

  describe('signature computation', () => {
    it('should compute consistent signatures for same text', () => {
      const text = 'This is a test document for minhash';
      
      const sig1 = detector.computeSignature(text);
      const sig2 = detector.computeSignature(text);

      expect(sig1).toEqual(sig2);
      expect(sig1).toHaveLength(64);
    });

    it('should compute different signatures for different texts', () => {
      const text1 = 'This is the first document';
      const text2 = 'This is completely different';

      const sig1 = detector.computeSignature(text1);
      const sig2 = detector.computeSignature(text2);

      // Should have some differences
      const differences = sig1.filter((v, i) => v !== sig2[i]).length;
      expect(differences).toBeGreaterThan(0);
    });

    it('should have similar signatures for similar texts', () => {
      const text1 = 'The quick brown fox jumps over the lazy dog';
      const text2 = 'The quick brown fox jumps over the lazy cat';

      const sig1 = detector.computeSignature(text1);
      const sig2 = detector.computeSignature(text2);

      const similarity = detector.calculateSimilarity(sig1, sig2);
      expect(similarity).toBeGreaterThan(0.5);
    });
  });

  describe('similarity calculation', () => {
    it('should return 1.0 for identical signatures', () => {
      const sig = detector.computeSignature('test text');
      const similarity = detector.calculateSimilarity(sig, sig);
      
      expect(similarity).toBe(1);
    });

    it('should return 0 for completely different signatures', () => {
      const sig1 = new Array(64).fill(0);
      const sig2 = new Array(64).fill(1);
      
      const similarity = detector.calculateSimilarity(sig1, sig2);
      expect(similarity).toBe(0);
    });

    it('should throw error for different length signatures', () => {
      const sig1 = [1, 2, 3];
      const sig2 = [1, 2, 3, 4];
      
      expect(() => detector.calculateSimilarity(sig1, sig2)).toThrow();
    });
  });

  describe('duplicate detection', () => {
    it('should find exact duplicates', () => {
      detector.addRecord('doc1', 'This is a test document');
      detector.addRecord('doc2', 'This is a test document'); // Exact duplicate
      detector.addRecord('doc3', 'Something completely different');

      const duplicates = detector.findNearDuplicates('doc1');
      
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].id).toBe('doc2');
      expect(duplicates[0].similarity).toBe(1);
    });

    it('should find near-duplicates above threshold', () => {
      detector.addRecord('doc1', 'The quick brown fox jumps over the lazy dog');
      detector.addRecord('doc2', 'The quick brown fox jumps over the lazy cat'); // Very similar
      detector.addRecord('doc3', 'Completely unrelated text here');

      const duplicates = detector.findNearDuplicates('doc1');
      
      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0].id).toBe('doc2');
      expect(duplicates[0].similarity).toBeGreaterThan(0.7);
    });

    it('should not find duplicates below threshold', () => {
      detector.addRecord('doc1', 'The quick brown fox jumps over the lazy dog');
      detector.addRecord('doc2', 'Totally different content about other topics');

      const duplicates = detector.findNearDuplicates('doc1');
      
      expect(duplicates.length).toBe(0);
    });
  });

  describe('duplicate groups', () => {
    it('should group near-duplicates together', () => {
      detector.addRecord('doc1', 'The quick brown fox jumps');
      detector.addRecord('doc2', 'The quick brown fox jumps'); // Exact dup
      detector.addRecord('doc3', 'The quick brown fox jumps over'); // Near dup

      const groups = detector.findDuplicateGroups();
      
      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].records).toContain('doc1');
      expect(groups[0].records).toContain('doc2');
    });

    it('should choose representative for each group', () => {
      detector.addRecord('doc1', 'Test document');
      detector.addRecord('doc2', 'Test document');

      const groups = detector.findDuplicateGroups();
      
      expect(groups[0].representative).toBeDefined();
      expect(groups[0].records).toContain(groups[0].representative);
    });
  });

  describe('batch detection', () => {
    it('should detect duplicates in batch', () => {
      const records = [
        { id: '1', text: 'Document A' },
        { id: '2', text: 'Document A' }, // Dup
        { id: '3', text: 'Document B' },
        { id: '4', text: 'Document A' }, // Dup
      ];

      const groups = detector.detectDuplicates(records);
      
      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].records.length).toBe(3); // All As
    });

    it('should return records to remove', () => {
      const records = [
        { id: '1', text: 'Document A' },
        { id: '2', text: 'Document A' }, // Should be removed
        { id: '3', text: 'Document B' },
      ];

      detector.detectDuplicates(records);
      const toRemove = detector.getRecordsToRemove();
      
      expect(toRemove).toContain('2');
      expect(toRemove).not.toContain('1'); // Representative
      expect(toRemove).not.toContain('3'); // Different
    });
  });

  describe('statistics', () => {
    it('should report stats correctly', () => {
      detector.addRecord('1', 'Text one');
      detector.addRecord('2', 'Text two');
      detector.addRecord('3', 'Text three');

      const stats = detector.getStats();
      
      expect(stats.totalSignatures).toBe(3);
      expect(stats.config.numHashes).toBe(64);
      expect(stats.estimatedMemoryBytes).toBe(3 * 64 * 4);
    });
  });
});

describe('LSHIndex', () => {
  it('should add and query signatures', () => {
    const lsh = new LSHIndex(64, 8);
    const sig = new Array(64).fill(0).map((_, i) => i);

    lsh.addSignature('doc1', sig);
    const candidates = lsh.queryCandidates('doc2', sig);

    expect(candidates.has('doc1')).toBe(true);
  });

  it('should return empty set for no matches', () => {
    const lsh = new LSHIndex(64, 8);
    
    lsh.addSignature('doc1', new Array(64).fill(0));
    const candidates = lsh.queryCandidates('doc2', new Array(64).fill(1));

    expect(candidates.size).toBe(0);
  });

  it('should report stats correctly', () => {
    const lsh = new LSHIndex(64, 8);
    
    // Add some signatures
    for (let i = 0; i < 10; i++) {
      lsh.addSignature(`doc${i}`, new Array(64).fill(0).map((_, j) => i * 64 + j));
    }

    const stats = lsh.getStats();
    
    expect(stats.totalBands).toBe(8);
    expect(stats.rowsPerBand).toBe(8);
    expect(stats.totalBuckets).toBeGreaterThan(0);
  });

  it('should throw error for invalid band count', () => {
    expect(() => new LSHIndex(10, 20)).toThrow();
  });
});
