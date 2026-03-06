import { describe, it, expect } from 'vitest';
import { EmbeddingFormatter, EmbeddingRecord } from '@/lib/preparation/compile/embedding-formatter';

describe('EmbeddingFormatter', () => {
  const formatter = new EmbeddingFormatter();

  describe('format', () => {
    it('should format records with default fields', () => {
      const records = [
        { id: 'doc1', text: 'This is a sample text for embedding.' },
        { id: 'doc2', text: 'Another sample text.' },
      ];

      const result = formatter.format(records);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('doc1');
      expect(result[0].text).toBe('This is a sample text for embedding.');
      expect(result[0].model).toBe('unknown');
    });

    it('should filter out records with empty text', () => {
      const records = [
        { id: 'doc1', text: 'Valid text.' },
        { id: 'doc2', text: '' },
        { id: 'doc3', text: '   ' },
      ];

      const result = formatter.format(records);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doc1');
    });

    it('should handle custom field mappings', () => {
      const records = [
        { doc_id: 'd1', content: 'Custom text content here.', source: 'wiki' },
      ];

      const result = formatter.format(records, {
        id_field: 'doc_id',
        text_field: 'content',
      });

      expect(result[0].id).toBe('d1');
      expect(result[0].text).toBe('Custom text content here.');
    });

    it('should include metadata by default', () => {
      const records = [
        {
          id: 'doc1',
          text: 'Text here.',
          source: 'medical_textbook',
          page: 42,
          category: 'disease',
        },
      ];

      const result = formatter.format(records);

      expect(result[0].metadata).toBeDefined();
      expect(result[0].metadata).toEqual({
        source: 'medical_textbook',
        page: 42,
        category: 'disease',
      });
    });

    it('should exclude specified fields from metadata', () => {
      const records = [
        {
          id: 'doc1',
          text: 'Text.',
          internal_id: '123',
          created_at: '2024-01-01',
        },
      ];

      const result = formatter.format(records, {
        metadata_fields: ['internal_id'],
      });

      expect(result[0].metadata).toEqual({ internal_id: '123' });
    });

    it('should disable metadata when configured', () => {
      const records = [
        { id: 'doc1', text: 'Text.', extra: 'data' },
      ];

      const result = formatter.format(records, { include_metadata: false });

      expect(result[0].metadata).toBeUndefined();
    });

    it('should generate ids when missing', () => {
      const records = [
        { text: 'Text without explicit id.' },
      ];

      const result = formatter.format(records);

      expect(result[0].id).toBeDefined();
      expect(result[0].id).toMatch(/^emb-/);
    });

    it('should set model when provided', () => {
      const records = [
        { id: 'doc1', text: 'Text.' },
      ];

      const result = formatter.format(records, { model: 'text-embedding-3-small' });

      expect(result[0].model).toBe('text-embedding-3-small');
    });

    it('should handle empty records array', () => {
      const result = formatter.format([]);
      expect(result).toHaveLength(0);
    });

    it('should convert non-string values to strings', () => {
      const records = [
        { id: 123, text: 'Text.', count: 42 },
      ];

      const result = formatter.format(records);

      expect(result[0].id).toBe('123');
    });
  });

  describe('validate', () => {
    it('should validate correct records', () => {
      const records: EmbeddingRecord[] = [
        { id: 'd1', text: 'Valid text.' },
        { id: 'd2', text: 'Another valid text.' },
      ];

      const result = formatter.validate(records);

      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect records with empty text', () => {
      const records: EmbeddingRecord[] = [
        { id: 'd1', text: '' },
        { id: 'd2', text: 'Valid text.' },
      ];

      const result = formatter.validate(records);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toBe(1);
      expect(result.errors[0]).toContain('missing or empty text');
    });

    it('should detect records with missing id', () => {
      const records: EmbeddingRecord[] = [
        { id: '', text: 'Valid text.' },
        { id: 'd2', text: 'Valid text.' },
      ];

      const result = formatter.validate(records);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toBe(1);
      expect(result.errors[0]).toContain('missing id');
    });

    it('should report multiple errors', () => {
      const records: EmbeddingRecord[] = [
        { id: '', text: '' },
        { id: '', text: 'Only text.' },
        { id: 'd3', text: '' },
      ];

      const result = formatter.validate(records);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toBe(3);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('addEmbeddings', () => {
    it('should add embeddings to records', () => {
      const records: EmbeddingRecord[] = [
        { id: 'd1', text: 'Text 1.' },
        { id: 'd2', text: 'Text 2.' },
      ];

      const embeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];

      const result = formatter.addEmbeddings(records, embeddings, 'text-embedding-3-small');

      expect(result[0].embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result[1].embedding).toEqual([0.4, 0.5, 0.6]);
      expect(result[0].model).toBe('text-embedding-3-small');
    });

    it('should throw error when counts mismatch', () => {
      const records: EmbeddingRecord[] = [{ id: 'd1', text: 'Text.' }];
      const embeddings = [[0.1, 0.2], [0.3, 0.4]];

      expect(() => {
        formatter.addEmbeddings(records, embeddings, 'model');
      }).toThrow('Records count (1) does not match embeddings count (2)');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      expect(formatter.estimateTokens('')).toBe(0);
      expect(formatter.estimateTokens('abcd')).toBe(1);
      expect(formatter.estimateTokens('a'.repeat(40))).toBe(10);
      expect(formatter.estimateTokens('a'.repeat(100))).toBe(25);
    });
  });

  describe('getStatistics', () => {
    it('should calculate statistics correctly', () => {
      const records: EmbeddingRecord[] = [
        { id: 'd1', text: 'Short.', embedding: [0.1, 0.2], model: 'model-a' },
        { id: 'd2', text: 'Medium length text here.', model: 'model-b' },
        { id: 'd3', text: 'Another text.', embedding: [0.3, 0.4], model: 'model-a' },
      ];

      const stats = formatter.getStatistics(records);

      expect(stats.total).toBe(3);
      expect(stats.withEmbeddings).toBe(2);
      expect(stats.models['model-a']).toBe(2);
      expect(stats.models['model-b']).toBe(1);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.avgTextLength).toBeGreaterThan(0);
    });

    it('should handle empty records array', () => {
      const stats = formatter.getStatistics([]);

      expect(stats.total).toBe(0);
      expect(stats.withEmbeddings).toBe(0);
      expect(stats.avgTextLength).toBe(0);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const key1 = formatter.generateCacheKey('Hello world', 'model-v1');
      const key2 = formatter.generateCacheKey('Hello world', 'model-v1');

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = formatter.generateCacheKey('Hello world', 'model-v1');
      const key2 = formatter.generateCacheKey('Hello world', 'model-v2');
      const key3 = formatter.generateCacheKey('Goodbye world', 'model-v1');

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('should include version in key generation', () => {
      const key1 = formatter.generateCacheKey('Text', 'model', 'v1');
      const key2 = formatter.generateCacheKey('Text', 'model', 'v2');

      expect(key1).not.toBe(key2);
    });
  });

  describe('medical use cases', () => {
    it('should format medical text for embeddings', () => {
      const records = [
        {
          id: 'clinical-note-1',
          text: 'Patient presents with fever and cough. Suspected viral infection.',
          patient_id: 'p12345',
          department: 'ER',
          diagnosis: 'viral_infection',
        },
      ];

      const result = formatter.format(records, {
        metadata_fields: ['department', 'diagnosis'],
      });

      expect(result[0].id).toBe('clinical-note-1');
      expect(result[0].text).toContain('Patient presents');
      expect(result[0].metadata).toEqual({
        department: 'ER',
        diagnosis: 'viral_infection',
      });
    });

    it('should estimate tokens for long medical documents', () => {
      const longText = 'Patient history: '.repeat(100); // ~1700 chars
      const tokens = formatter.estimateTokens(longText);

      expect(tokens).toBeGreaterThan(400);
    });
  });
});
