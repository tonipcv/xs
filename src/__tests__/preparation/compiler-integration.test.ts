import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompilerRegistry } from '@/lib/preparation/compile/compiler-registry';

const mockGetRecords = vi.fn();

vi.mock('@/lib/preparation/adapters/dataset-adapter', () => ({
  DatasetAdapter: class {
    getRecords = mockGetRecords;
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024 }),
  },
}));

describe('CompilerRegistry Integration', () => {
  let registry: CompilerRegistry;

  beforeEach(() => {
    registry = new CompilerRegistry();
    mockGetRecords.mockReset();
  });

  describe('RAG compilation', () => {
    it('should compile text for RAG with chunking', async () => {
      const mockRecords = [
        {
          id: 'doc1',
          content: 'This is a medical note about patient symptoms and treatment plan.',
          metadata: { patient_id: 'p123', date: '2026-03-05' },
        },
        {
          id: 'doc2',
          content: 'Follow-up visit shows improvement in condition.',
          metadata: { patient_id: 'p123', date: '2026-03-06' },
        },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('rag', 'text', 'generic');
      const result = await compiler.compile('dataset-1', {
        chunk_tokens: 10,
        overlap_tokens: 2,
        preserveMetadata: true,
      });

      expect(result.shardCount).toBeGreaterThan(0);
      expect(result.totalSizeBytes).toBeGreaterThan(0);
      expect(result.outputPaths).toHaveLength(1);
      expect(result.recordCount).toBeGreaterThan(0);
    });

    it('should handle empty dataset', async () => {
      mockGetRecords.mockResolvedValue([]);

      const compiler = registry.getCompiler('rag', 'text', 'generic');
      const result = await compiler.compile('dataset-empty', {
        chunk_tokens: 512,
        overlap_tokens: 50,
      });

      expect(result.recordCount).toBe(0);
    });
  });

  describe('SFT compilation', () => {
    it('should compile with ChatML template', async () => {
      const mockRecords = [
        {
          id: 'ex1',
          input: 'What are the symptoms of pneumonia?',
          output: 'Common symptoms include fever, cough, and difficulty breathing.',
          system: 'You are a medical assistant.',
        },
        {
          id: 'ex2',
          input: 'How is diabetes diagnosed?',
          output: 'Diabetes is diagnosed through blood glucose tests.',
        },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('fine-tuning', 'text', 'openai');
      const result = await compiler.compile('dataset-sft', {
        template: 'chatml',
        system_prompt: 'You are a helpful medical AI.',
      });

      expect(result.shardCount).toBe(1);
      expect(result.recordCount).toBe(2);
      expect(result.format).toBe('jsonl');
    });

    it('should compile with Alpaca template', async () => {
      const mockRecords = [
        {
          id: 'ex1',
          input: 'Patient has fever and cough',
          output: 'Likely diagnosis: Upper respiratory infection',
          instruction: 'Provide a diagnosis based on symptoms',
        },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('fine-tuning', 'text', 'hf');
      const result = await compiler.compile('dataset-alpaca', {
        template: 'alpaca',
      });

      expect(result.recordCount).toBe(1);
    });

    it('should filter invalid examples', async () => {
      const mockRecords = [
        {
          id: 'valid',
          input: 'Valid question',
          output: 'Valid answer',
        },
        {
          id: 'invalid1',
          input: '',
          output: 'No input',
        },
        {
          id: 'invalid2',
          input: 'No output',
          output: '',
        },
      ];

      mockGetRecords.mockResolvedValue(mockRecords);

      const compiler = registry.getCompiler('fine-tuning', 'text', 'openai');
      const result = await compiler.compile('dataset-mixed', {
        template: 'chatml',
      });

      expect(result.recordCount).toBe(1);
    });
  });

  describe('Compiler selection', () => {
    it('should get correct compiler for task/modality/runtime', () => {
      const ragCompiler = registry.getCompiler('rag', 'text', 'generic');
      expect(ragCompiler).toBeDefined();

      const sftCompiler = registry.getCompiler('fine-tuning', 'text', 'hf');
      expect(sftCompiler).toBeDefined();

      const dpoCompiler = registry.getCompiler('dpo', 'text', 'trl');
      expect(dpoCompiler).toBeDefined();
    });

    it('should throw error for unsupported combination', () => {
      expect(() => {
        registry.getCompiler('rag' as any, 'audio' as any, 'generic');
      }).toThrow('No compiler registered');
    });
  });

  describe('Configuration handling', () => {
    it('should use default config values', async () => {
      mockGetRecords.mockResolvedValue([
        { id: 'doc1', content: 'Test content here' },
      ]);

      const compiler = registry.getCompiler('rag', 'text', 'generic');
      const result = await compiler.compile('dataset-1', {});

      expect(result).toBeDefined();
      expect(result.recordCount).toBeGreaterThan(0);
    });

    it('should respect custom chunk_tokens', async () => {
      mockGetRecords.mockResolvedValue([
        { id: 'doc1', content: 'word1 word2 word3 word4 word5 word6 word7 word8' },
      ]);

      const compiler = registry.getCompiler('rag', 'text', 'generic');
      const result = await compiler.compile('dataset-1', {
        chunk_tokens: 3,
        overlap_tokens: 0,
      });

      expect(result.recordCount).toBeGreaterThan(1);
    });
  });
});
