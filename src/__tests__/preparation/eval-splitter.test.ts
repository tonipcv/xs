import { describe, it, expect, beforeEach } from 'vitest';
import { EvalSplitter } from '@/lib/preparation/compile/eval-splitter';

describe('EvalSplitter', () => {
  let splitter: EvalSplitter;

  beforeEach(() => {
    splitter = new EvalSplitter();
  });

  describe('validation', () => {
    it('should reject splits that do not sum to 1.0', () => {
      const records = [{ id: 1 }, { id: 2 }];
      
      expect(() => {
        splitter.split(records, { train: 0.6, test: 0.3 }); // sum = 0.9
      }).toThrow('Split ratios must sum to 1.0');
    });

    it('should reject negative train split', () => {
      const records = [{ id: 1 }];
      
      expect(() => {
        splitter.split(records, { train: -0.1, test: 1.1 });
      }).toThrow('Train and test splits must be positive');
    });

    it('should reject negative val split', () => {
      const records = [{ id: 1 }];
      
      expect(() => {
        splitter.split(records, { train: 0.7, test: 0.2, val: -0.1 });
      }).toThrow('Val split must be non-negative');
    });

    it('should accept valid splits', () => {
      const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
      
      expect(() => {
        splitter.split(records, { train: 0.7, test: 0.3 });
      }).not.toThrow();
    });
  });

  describe('random split', () => {
    it('should split into train and test', () => {
      const records = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      
      const result = splitter.split(records, {
        train: 0.7,
        test: 0.3,
      });

      expect(result.train.length).toBe(70);
      expect(result.test.length).toBe(30);
      expect(result.val).toBeUndefined();
    });

    it('should split into train, test, and val', () => {
      const records = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      
      const result = splitter.split(records, {
        train: 0.6,
        test: 0.2,
        val: 0.2,
      });

      expect(result.train.length).toBe(60);
      expect(result.test.length).toBe(20);
      expect(result.val).toBeDefined();
      expect(result.val!.length).toBe(20);
    });

    it('should be reproducible with same seed', () => {
      const records = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      
      const result1 = splitter.split(records, {
        train: 0.7,
        test: 0.3,
        seed: 42,
      });

      const result2 = splitter.split(records, {
        train: 0.7,
        test: 0.3,
        seed: 42,
      });

      expect(result1.train.map(r => r.id)).toEqual(result2.train.map(r => r.id));
      expect(result1.test.map(r => r.id)).toEqual(result2.test.map(r => r.id));
    });

    it('should produce different splits with different seeds', () => {
      const records = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      
      const result1 = splitter.split(records, {
        train: 0.7,
        test: 0.3,
        seed: 42,
      });

      const result2 = splitter.split(records, {
        train: 0.7,
        test: 0.3,
        seed: 123,
      });

      expect(result1.train.map(r => r.id)).not.toEqual(result2.train.map(r => r.id));
    });

    it('should handle small datasets', () => {
      const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
      
      const result = splitter.split(records, {
        train: 0.7,
        test: 0.3,
      });

      expect(result.train.length).toBe(2);
      expect(result.test.length).toBe(1);
    });
  });

  describe('stratified split', () => {
    it('should maintain label distribution', () => {
      const records = [
        { id: 1, label: 'A' },
        { id: 2, label: 'A' },
        { id: 3, label: 'A' },
        { id: 4, label: 'A' },
        { id: 5, label: 'B' },
        { id: 6, label: 'B' },
        { id: 7, label: 'B' },
        { id: 8, label: 'B' },
      ];

      const result = splitter.split(records, {
        train: 0.75,
        test: 0.25,
        stratify_by: 'label',
      });

      const trainLabelsA = result.train.filter(r => r.label === 'A').length;
      const trainLabelsB = result.train.filter(r => r.label === 'B').length;
      const testLabelsA = result.test.filter(r => r.label === 'A').length;
      const testLabelsB = result.test.filter(r => r.label === 'B').length;

      expect(trainLabelsA).toBe(3);
      expect(trainLabelsB).toBe(3);
      expect(testLabelsA).toBe(1);
      expect(testLabelsB).toBe(1);
    });

    it('should work with multiple labels', () => {
      const records = [
        { id: 1, label: 'A' },
        { id: 2, label: 'A' },
        { id: 3, label: 'B' },
        { id: 4, label: 'B' },
        { id: 5, label: 'C' },
        { id: 6, label: 'C' },
      ];

      const result = splitter.split(records, {
        train: 0.5,
        test: 0.5,
        stratify_by: 'label',
      });

      expect(result.train.length).toBe(3);
      expect(result.test.length).toBe(3);

      const trainLabels = new Set(result.train.map(r => r.label));
      const testLabels = new Set(result.test.map(r => r.label));

      expect(trainLabels.size).toBe(3);
      expect(testLabels.size).toBe(3);
    });

    it('should stratify with val split', () => {
      const records = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        label: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
      }));

      const result = splitter.split(records, {
        train: 0.6,
        test: 0.2,
        val: 0.2,
        stratify_by: 'label',
      });

      expect(result.train.length).toBe(18);
      expect(result.test.length).toBe(6);
      expect(result.val!.length).toBe(6);
    });
  });

  describe('statistics', () => {
    it('should calculate split statistics', () => {
      const records = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      
      const result = splitter.split(records, {
        train: 0.7,
        test: 0.3,
      });

      const stats = splitter.getStatistics(result);

      expect(stats.total).toBe(100);
      expect(stats.train.count).toBe(70);
      expect(stats.train.percentage).toBeCloseTo(70, 1);
      expect(stats.test.count).toBe(30);
      expect(stats.test.percentage).toBeCloseTo(30, 1);
      expect(stats.val).toBeUndefined();
    });

    it('should calculate statistics with val split', () => {
      const records = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      
      const result = splitter.split(records, {
        train: 0.6,
        test: 0.2,
        val: 0.2,
      });

      const stats = splitter.getStatistics(result);

      expect(stats.total).toBe(100);
      expect(stats.train.percentage).toBeCloseTo(60, 1);
      expect(stats.test.percentage).toBeCloseTo(20, 1);
      expect(stats.val!.percentage).toBeCloseTo(20, 1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty dataset', () => {
      const records: any[] = [];
      
      const result = splitter.split(records, {
        train: 0.7,
        test: 0.3,
      });

      expect(result.train.length).toBe(0);
      expect(result.test.length).toBe(0);
    });

    it('should handle single record', () => {
      const records = [{ id: 1 }];
      
      const result = splitter.split(records, {
        train: 0.7,
        test: 0.3,
      });

      expect(result.train.length + result.test.length).toBe(1);
    });

    it('should handle 50/50 split', () => {
      const records = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      
      const result = splitter.split(records, {
        train: 0.5,
        test: 0.5,
      });

      expect(result.train.length).toBe(50);
      expect(result.test.length).toBe(50);
    });
  });

  describe('medical use cases', () => {
    it('should split patient records by diagnosis', () => {
      const records = [
        { patient_id: 'p1', diagnosis: 'pneumonia', data: 'chest X-ray' },
        { patient_id: 'p2', diagnosis: 'pneumonia', data: 'CT scan' },
        { patient_id: 'p3', diagnosis: 'covid', data: 'PCR test' },
        { patient_id: 'p4', diagnosis: 'covid', data: 'antibody test' },
        { patient_id: 'p5', diagnosis: 'flu', data: 'rapid test' },
        { patient_id: 'p6', diagnosis: 'flu', data: 'culture' },
      ];

      const result = splitter.split(records, {
        train: 0.67,
        test: 0.33,
        stratify_by: 'diagnosis',
        seed: 42,
      });

      const trainDiagnoses = result.train.map(r => r.diagnosis);
      const testDiagnoses = result.test.map(r => r.diagnosis);

      expect(trainDiagnoses).toContain('pneumonia');
      expect(trainDiagnoses).toContain('covid');
      expect(trainDiagnoses).toContain('flu');
      expect(testDiagnoses).toContain('pneumonia');
      expect(testDiagnoses).toContain('covid');
      expect(testDiagnoses).toContain('flu');
    });
  });
});
