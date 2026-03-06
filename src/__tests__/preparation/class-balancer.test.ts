import { describe, it, expect } from 'vitest';
import { ClassBalancer } from '@/lib/preparation/compile/class-balancer';

describe('ClassBalancer', () => {
  const balancer = new ClassBalancer();

  describe('balance', () => {
    it('should return unchanged when strategy is none', () => {
      const split = {
        train: [
          { input: 'q1', expected_output: 'a1', label: 'A' },
          { input: 'q2', expected_output: 'a2', label: 'A' },
          { input: 'q3', expected_output: 'a3', label: 'B' },
        ],
        test: [{ input: 'q4', expected_output: 'a4', label: 'A' }],
      };

      const result = balancer.balance(split, { strategy: 'none' });

      expect(result.train).toHaveLength(3);
      expect(result.balanceStats.strategy).toBe('none');
      expect(result.balanceStats.recordsRemoved).toBe(0);
      expect(result.balanceStats.recordsAdded).toBe(0);
    });

    it('should undersample majority class', () => {
      const split = {
        train: [
          { input: 'q1', expected_output: 'a1', label: 'A' },
          { input: 'q2', expected_output: 'a2', label: 'A' },
          { input: 'q3', expected_output: 'a3', label: 'A' },
          { input: 'q4', expected_output: 'a4', label: 'A' },
          { input: 'q5', expected_output: 'a5', label: 'B' },
        ],
        test: [],
      };

      const result = balancer.balance(split, { strategy: 'undersample', target_ratio: 1, seed: 42 });

      expect(result.train).toHaveLength(2); // 1 from A, 1 from B
      expect(result.balanceStats.strategy).toBe('undersample');
      expect(result.balanceStats.recordsRemoved).toBe(3);
      
      const distribution = result.balanceStats.balancedDistribution;
      expect(distribution['A']).toBe(1);
      expect(distribution['B']).toBe(1);
    });

    it('should oversample minority class', () => {
      const split = {
        train: [
          { input: 'q1', expected_output: 'a1', label: 'A' },
          { input: 'q2', expected_output: 'a2', label: 'A' },
          { input: 'q3', expected_output: 'a3', label: 'A' },
          { input: 'q4', expected_output: 'a4', label: 'A' },
          { input: 'q5', expected_output: 'a5', label: 'B' },
        ],
        test: [],
      };

      const result = balancer.balance(split, { strategy: 'oversample', target_ratio: 1, seed: 42 });

      expect(result.train).toHaveLength(8); // 4 from A, 4 from B (duplicated)
      expect(result.balanceStats.strategy).toBe('oversample');
      expect(result.balanceStats.recordsAdded).toBe(3);
      
      const distribution = result.balanceStats.balancedDistribution;
      expect(distribution['A']).toBe(4);
      expect(distribution['B']).toBe(4);
    });

    it('should preserve test and val sets', () => {
      const split = {
        train: [
          { input: 'q1', expected_output: 'a1', label: 'A' },
          { input: 'q2', expected_output: 'a2', label: 'A' },
          { input: 'q3', expected_output: 'a3', label: 'B' },
        ],
        test: [{ input: 'qt', expected_output: 'at', label: 'A' }],
        val: [{ input: 'qv', expected_output: 'av', label: 'B' }],
      };

      const result = balancer.balance(split, { strategy: 'undersample' });

      expect(result.test).toHaveLength(1);
      expect(result.val).toHaveLength(1);
      expect(result.test[0].input).toBe('qt');
      expect(result.val![0].input).toBe('qv');
    });

    it('should handle empty train set', () => {
      const split = {
        train: [],
        test: [{ input: 'q1', expected_output: 'a1', label: 'A' }],
      };

      const result = balancer.balance(split, { strategy: 'undersample' });

      expect(result.train).toHaveLength(0);
      expect(result.balanceStats.originalDistribution).toEqual({});
    });

    it('should handle single class', () => {
      const split = {
        train: [
          { input: 'q1', expected_output: 'a1', label: 'A' },
          { input: 'q2', expected_output: 'a2', label: 'A' },
        ],
        test: [],
      };

      const result = balancer.balance(split, { strategy: 'undersample' });

      expect(result.train).toHaveLength(2);
      expect(result.balanceStats.balancedDistribution['A']).toBe(2);
    });

    it('should be deterministic with same seed', () => {
      const split = {
        train: [
          { input: 'q1', expected_output: 'a1', label: 'A' },
          { input: 'q2', expected_output: 'a2', label: 'A' },
          { input: 'q3', expected_output: 'a3', label: 'A' },
          { input: 'q4', expected_output: 'a4', label: 'A' },
          { input: 'q5', expected_output: 'a5', label: 'B' },
        ],
        test: [],
      };

      const result1 = balancer.balance(split, { strategy: 'undersample', target_ratio: 1, seed: 123 });
      const result2 = balancer.balance(split, { strategy: 'undersample', target_ratio: 1, seed: 123 });

      expect(result1.train.map(r => r.input)).toEqual(result2.train.map(r => r.input));
    });

    it('should mark synthetic samples in oversampling', () => {
      const split = {
        train: [
          { input: 'q1', expected_output: 'a1', label: 'A' },
          { input: 'q2', expected_output: 'a2', label: 'A' },
          { input: 'q3', expected_output: 'a3', label: 'A' },
          { input: 'q4', expected_output: 'a4', label: 'A' },
          { input: 'q5', expected_output: 'a5', label: 'B' },
        ],
        test: [],
      };

      const result = balancer.balance(split, { strategy: 'oversample', target_ratio: 1 });

      const syntheticSamples = result.train.filter(r => (r as any).metadata?._synthetic);
      expect(syntheticSamples.length).toBeGreaterThan(0);
    });

    it('should throw error for unknown strategy', () => {
      const split = {
        train: [{ input: 'q1', expected_output: 'a1', label: 'A' }],
        test: [],
      };

      expect(() => {
        balancer.balance(split, { strategy: 'unknown' as any });
      }).toThrow('Unknown balance strategy');
    });
  });

  describe('getImbalanceRatio', () => {
    it('should calculate correct ratio', () => {
      const distribution = { A: 100, B: 50 };
      expect(balancer.getImbalanceRatio(distribution)).toBe(2);
    });

    it('should return 1 for balanced distribution', () => {
      const distribution = { A: 50, B: 50 };
      expect(balancer.getImbalanceRatio(distribution)).toBe(1);
    });

    it('should return 1 for single class', () => {
      const distribution = { A: 100 };
      expect(balancer.getImbalanceRatio(distribution)).toBe(1);
    });
  });

  describe('isBalanced', () => {
    it('should return true for balanced distribution', () => {
      const distribution = { A: 50, B: 50 };
      expect(balancer.isBalanced(distribution)).toBe(true);
    });

    it('should return true for slightly imbalanced distribution', () => {
      const distribution = { A: 100, B: 70 };
      expect(balancer.isBalanced(distribution, 1.5)).toBe(true);
    });

    it('should return false for highly imbalanced distribution', () => {
      const distribution = { A: 100, B: 10 };
      expect(balancer.isBalanced(distribution, 1.5)).toBe(false);
    });
  });

  describe('medical use cases', () => {
    it('should balance diagnostic categories', () => {
      const split = {
        train: [
          { input: 'symptoms: fever', expected_output: 'flu', label: 'common' },
          { input: 'symptoms: cough', expected_output: 'cold', label: 'common' },
          { input: 'symptoms: fever', expected_output: 'flu', label: 'common' },
          { input: 'symptoms: chest pain', expected_output: 'cardiac', label: 'critical' },
        ],
        test: [],
      };

      const result = balancer.balance(split, { strategy: 'undersample', target_ratio: 1 });

      expect(result.balanceStats.originalDistribution['common']).toBe(3);
      expect(result.balanceStats.originalDistribution['critical']).toBe(1);
      
      // After balancing, both should have 1
      expect(result.balanceStats.balancedDistribution['common']).toBe(1);
      expect(result.balanceStats.balancedDistribution['critical']).toBe(1);
    });
  });
});
