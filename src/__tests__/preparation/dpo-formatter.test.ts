import { describe, it, expect, beforeEach } from 'vitest';
import { DPOFormatter, DPOExample } from '@/lib/preparation/compile/dpo-formatter';

describe('DPOFormatter', () => {
  let formatter: DPOFormatter;

  beforeEach(() => {
    formatter = new DPOFormatter();
  });

  describe('format', () => {
    it('should format basic DPO example', () => {
      const example: DPOExample = {
        prompt: 'What is the capital of France?',
        chosen: 'The capital of France is Paris.',
        rejected: 'I do not know.',
      };

      const result = formatter.format(example);

      expect(result.prompt).toBe('What is the capital of France?');
      expect(result.chosen).toBe('The capital of France is Paris.');
      expect(result.rejected).toBe('I do not know.');
    });

    it('should use context as prompt if prompt not provided', () => {
      const example: DPOExample = {
        context: 'User asks about geography',
        chosen: 'Paris is the capital.',
        rejected: 'Not sure.',
      };

      const result = formatter.format(example);

      expect(result.prompt).toBe('User asks about geography');
    });

    it('should use empty string if no prompt or context', () => {
      const example: DPOExample = {
        chosen: 'Good response',
        rejected: 'Bad response',
      };

      const result = formatter.format(example);

      expect(result.prompt).toBe('');
    });
  });

  describe('validation', () => {
    it('should validate correct example', () => {
      const example: DPOExample = {
        chosen: 'This is a good response.',
        rejected: 'This is a bad response.',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty chosen response', () => {
      const example: DPOExample = {
        chosen: '',
        rejected: 'Bad response',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Chosen response is required and cannot be empty');
    });

    it('should reject empty rejected response', () => {
      const example: DPOExample = {
        chosen: 'Good response',
        rejected: '',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Rejected response is required and cannot be empty');
    });

    it('should reject whitespace-only responses', () => {
      const example: DPOExample = {
        chosen: '   ',
        rejected: '   ',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject identical chosen and rejected', () => {
      const example: DPOExample = {
        chosen: 'Same response',
        rejected: 'Same response',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Chosen and rejected responses must be different');
    });

    it('should reject responses exceeding max length', () => {
      const longText = 'a'.repeat(10001);
      const example: DPOExample = {
        chosen: longText,
        rejected: 'Short response',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Chosen response exceeds maximum length (10000 characters)');
    });

    it('should collect multiple errors', () => {
      const example: DPOExample = {
        chosen: '',
        rejected: '',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens correctly', () => {
      const example: DPOExample = {
        prompt: 'What is AI?',
        chosen: 'AI is artificial intelligence.',
        rejected: 'I do not know.',
      };

      const tokens = formatter.estimateTokens(example);

      expect(tokens.prompt).toBe(3);
      expect(tokens.chosen).toBe(4);
      expect(tokens.rejected).toBe(4);
      expect(tokens.total).toBe(11);
    });

    it('should handle missing prompt', () => {
      const example: DPOExample = {
        chosen: 'Good answer',
        rejected: 'Bad answer',
      };

      const tokens = formatter.estimateTokens(example);

      expect(tokens.prompt).toBe(0);
      expect(tokens.total).toBe(4);
    });
  });

  describe('batch operations', () => {
    it('should format batch of examples', () => {
      const examples: DPOExample[] = [
        { chosen: 'Good 1', rejected: 'Bad 1' },
        { chosen: 'Good 2', rejected: 'Bad 2' },
      ];

      const results = formatter.formatBatch(examples);

      expect(results).toHaveLength(2);
      expect(results[0].chosen).toBe('Good 1');
      expect(results[1].chosen).toBe('Good 2');
    });

    it('should validate batch and separate valid/invalid', () => {
      const examples: DPOExample[] = [
        { chosen: 'Good', rejected: 'Bad' },
        { chosen: '', rejected: 'Bad' },
        { chosen: 'Same', rejected: 'Same' },
        { chosen: 'Valid', rejected: 'Invalid' },
      ];

      const result = formatter.validateBatch(examples);

      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid[0].errors.length).toBeGreaterThan(0);
    });

    it('should handle empty batch', () => {
      const examples: DPOExample[] = [];

      const result = formatter.validateBatch(examples);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe('medical use cases', () => {
    it('should format clinical decision preference', () => {
      const example: DPOExample = {
        prompt: 'Patient presents with chest pain and shortness of breath.',
        chosen: 'Recommend immediate cardiac evaluation including ECG and troponin levels.',
        rejected: 'Patient should rest and take aspirin.',
      };

      const result = formatter.format(example);

      expect(result.prompt).toContain('chest pain');
      expect(result.chosen).toContain('cardiac evaluation');
      expect(result.rejected).toContain('rest and take aspirin');
    });

    it('should validate medical preference pairs', () => {
      const example: DPOExample = {
        chosen: 'Based on symptoms, recommend CT scan for pulmonary embolism.',
        rejected: 'Patient is fine, no action needed.',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(true);
    });

    it('should reject unsafe medical preferences', () => {
      const example: DPOExample = {
        chosen: 'Immediate intervention required.',
        rejected: 'Immediate intervention required.',
      };

      const result = formatter.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Chosen and rejected responses must be different');
    });
  });
});
