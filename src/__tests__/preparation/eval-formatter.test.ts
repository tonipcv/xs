import { describe, it, expect } from 'vitest';
import { EvalFormatter, EvalRecord } from '@/lib/preparation/compile/eval-formatter';

describe('EvalFormatter', () => {
  const formatter = new EvalFormatter();

  describe('format', () => {
    it('should format records with default fields', () => {
      const records = [
        { input: 'What is diabetes?', expected_output: 'Diabetes is a chronic condition.', label: 'medical' },
        { input: 'Symptoms of flu?', expected_output: 'Fever, cough, fatigue.', label: 'symptoms' },
      ];

      const result = formatter.format(records);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        input: 'What is diabetes?',
        expected_output: 'Diabetes is a chronic condition.',
        label: 'medical',
      });
      expect(result[1]).toEqual({
        input: 'Symptoms of flu?',
        expected_output: 'Fever, cough, fatigue.',
        label: 'symptoms',
      });
    });

    it('should filter out invalid records with empty input or output', () => {
      const records = [
        { input: 'Valid question?', expected_output: 'Valid answer.' },
        { input: '', expected_output: 'No question provided.' },
        { input: 'Another question?', expected_output: '' },
        { input: '   ', expected_output: 'Whitespace input.' },
      ];

      const result = formatter.format(records);

      expect(result).toHaveLength(1);
      expect(result[0].input).toBe('Valid question?');
    });

    it('should handle custom field mappings', () => {
      const records = [
        { question: 'What is COVID?', answer: 'A viral disease.', category: 'disease' },
      ];

      const result = formatter.format(records, {
        input_field: 'question',
        output_field: 'answer',
        label_field: 'category',
      });

      expect(result[0]).toEqual({
        input: 'What is COVID?',
        expected_output: 'A viral disease.',
        label: 'disease',
      });
    });

    it('should include metadata by default', () => {
      const records = [
        {
          input: 'Question?',
          expected_output: 'Answer.',
          source: 'medical_textbook',
          page: 42,
          confidence: 0.95,
        },
      ];

      const result = formatter.format(records);

      expect(result[0].metadata).toBeDefined();
      expect(result[0].metadata).toEqual({
        source: 'medical_textbook',
        page: 42,
        confidence: 0.95,
      });
    });

    it('should exclude specified fields from metadata', () => {
      const records = [
        {
          input: 'Question?',
          expected_output: 'Answer.',
          label: 'category',
          internal_id: '123',
          created_at: '2024-01-01',
        },
      ];

      const result = formatter.format(records, {
        metadata_fields: ['internal_id', 'created_at'],
      });

      expect(result[0].metadata).toEqual({
        internal_id: '123',
        created_at: '2024-01-01',
      });
    });

    it('should handle records without label', () => {
      const records = [
        { input: 'Question?', expected_output: 'Answer.' },
      ];

      const result = formatter.format(records);

      expect(result[0].label).toBeUndefined();
    });

    it('should convert non-string values to strings', () => {
      const records = [
        { input: 123, expected_output: true, label: null },
      ];

      const result = formatter.format(records);

      expect(result[0].input).toBe('123');
      expect(result[0].expected_output).toBe('true');
    });

    it('should handle empty records array', () => {
      const result = formatter.format([]);
      expect(result).toHaveLength(0);
    });

    it('should handle records with no metadata when disabled', () => {
      const records = [
        { input: 'Q1?', expected_output: 'A1.', extra: 'data' },
      ];

      const result = formatter.format(records, { include_metadata: false });

      expect(result[0].metadata).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('should validate correct records', () => {
      const records: EvalRecord[] = [
        { input: 'Q1?', expected_output: 'A1.' },
        { input: 'Q2?', expected_output: 'A2.', label: 'test' },
      ];

      const result = formatter.validate(records);

      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect records with empty input', () => {
      const records: EvalRecord[] = [
        { input: '', expected_output: 'Answer.' },
        { input: 'Question?', expected_output: 'Answer.' },
      ];

      const result = formatter.validate(records);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toBe(1);
      expect(result.errors[0]).toContain('missing or empty input');
    });

    it('should detect records with empty expected_output', () => {
      const records: EvalRecord[] = [
        { input: 'Question?', expected_output: '' },
        { input: 'Question 2?', expected_output: 'Answer.' },
      ];

      const result = formatter.validate(records);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toBe(1);
      expect(result.errors[0]).toContain('missing or empty expected_output');
    });

    it('should report multiple errors', () => {
      const records: EvalRecord[] = [
        { input: '', expected_output: '' },
        { input: '', expected_output: 'Only output.' },
        { input: 'Only input.', expected_output: '' },
      ];

      const result = formatter.validate(records);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toBe(3);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('medical use cases', () => {
    it('should format medical QA pairs', () => {
      const records = [
        {
          question: 'What are the symptoms of pneumonia?',
          answer: 'Common symptoms include fever, cough, and difficulty breathing.',
          specialty: 'pulmonology',
          severity: 'high',
        },
      ];

      const result = formatter.format(records, {
        input_field: 'question',
        output_field: 'answer',
        label_field: 'specialty',
      });

      expect(result[0]).toEqual({
        input: 'What are the symptoms of pneumonia?',
        expected_output: 'Common symptoms include fever, cough, and difficulty breathing.',
        label: 'pulmonology',
        metadata: { severity: 'high' },
      });
    });

    it('should handle diagnostic records', () => {
      const records = [
        {
          symptoms: 'Fever, headache, fatigue',
          diagnosis: 'Viral infection',
          icd10: 'B34.9',
          confidence: 0.87,
        },
      ];

      const result = formatter.format(records, {
        input_field: 'symptoms',
        output_field: 'diagnosis',
        label_field: 'icd10',
      });

      expect(result[0].input).toBe('Fever, headache, fatigue');
      expect(result[0].expected_output).toBe('Viral infection');
      expect(result[0].label).toBe('B34.9');
      expect(result[0].metadata).toEqual({ confidence: 0.87 });
    });
  });
});
