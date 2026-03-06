import { describe, it, expect, beforeEach } from 'vitest';
import { Chunker } from '@/lib/preparation/compile/chunker';

describe('Chunker', () => {
  let chunker: Chunker;

  beforeEach(() => {
    chunker = new Chunker();
  });

  describe('basic chunking', () => {
    it('should split text into chunks with specified token count', () => {
      const text = 'This is a test document with multiple words that should be split into chunks';
      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 5,
        overlap_tokens: 0,
      });

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        const tokenCount = chunk.text.split(/\s+/).length;
        expect(tokenCount).toBeLessThanOrEqual(5);
      });
    });

    it('should create overlapping chunks', () => {
      const text = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10';
      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 5,
        overlap_tokens: 2,
      });

      expect(chunks.length).toBeGreaterThan(1);
      
      // Check that consecutive chunks have overlap (except possibly the last chunk)
      for (let i = 0; i < chunks.length - 1; i++) {
        const currentTokens = chunks[i].text.split(/\s+/);
        const nextTokens = chunks[i + 1].text.split(/\s+/);
        
        // Check overlap: last N tokens of current should match first N tokens of next
        const actualOverlap = Math.min(2, currentTokens.length, nextTokens.length);
        const overlapCurrent = currentTokens.slice(-actualOverlap);
        const overlapNext = nextTokens.slice(0, actualOverlap);
        
        expect(overlapCurrent).toEqual(overlapNext);
      }
    });

    it('should handle text shorter than chunk size', () => {
      const text = 'short text';
      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 100,
        overlap_tokens: 10,
      });

      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(text);
    });
  });

  describe('chunk metadata', () => {
    it('should include correct chunk IDs', () => {
      const text = 'word1 word2 word3 word4 word5 word6 word7 word8';
      const chunks = chunker.chunk(text, 'doc-123', {
        chunk_tokens: 3,
        overlap_tokens: 0,
      });

      chunks.forEach((chunk, index) => {
        expect(chunk.chunk_id).toBe(`doc-123_chunk_${index}`);
      });
    });

    it('should include source_id in metadata', () => {
      const text = 'test text here';
      const chunks = chunker.chunk(text, 'source-abc', {
        chunk_tokens: 5,
        overlap_tokens: 0,
      });

      chunks.forEach(chunk => {
        expect(chunk.metadata.source_id).toBe('source-abc');
      });
    });

    it('should include chunk index and total chunks', () => {
      const text = 'word1 word2 word3 word4 word5 word6 word7 word8 word9';
      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 3,
        overlap_tokens: 0,
      });

      const totalChunks = chunks.length;
      chunks.forEach((chunk, index) => {
        expect(chunk.metadata.chunk_index).toBe(index);
        expect(chunk.metadata.total_chunks).toBe(totalChunks);
      });
    });

    it('should include start and end offsets', () => {
      const text = 'word1 word2 word3 word4 word5 word6';
      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 3,
        overlap_tokens: 1,
      });

      expect(chunks[0].metadata.start_offset).toBe(0);
      expect(chunks[0].metadata.end_offset).toBe(3);
      
      expect(chunks[1].metadata.start_offset).toBe(2); // step = 3 - 1 = 2
      expect(chunks[1].metadata.end_offset).toBe(5);
    });

    it('should preserve additional metadata when configured', () => {
      const text = 'test text';
      const additionalMetadata = {
        patient_id: 'patient-123',
        document_type: 'clinical_note',
        date: '2026-03-05',
      };

      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 5,
        overlap_tokens: 0,
        preserveMetadata: true,
      }, additionalMetadata);

      chunks.forEach(chunk => {
        expect(chunk.metadata.patient_id).toBe('patient-123');
        expect(chunk.metadata.document_type).toBe('clinical_note');
        expect(chunk.metadata.date).toBe('2026-03-05');
      });
    });

    it('should not include additional metadata when preserveMetadata is false', () => {
      const text = 'test text';
      const additionalMetadata = {
        patient_id: 'patient-123',
      };

      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 5,
        overlap_tokens: 0,
        preserveMetadata: false,
      }, additionalMetadata);

      chunks.forEach(chunk => {
        expect(chunk.metadata.patient_id).toBeUndefined();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const chunks = chunker.chunk('', 'doc-1', {
        chunk_tokens: 5,
        overlap_tokens: 0,
      });

      expect(chunks.length).toBe(0);
    });

    it('should handle single word', () => {
      const chunks = chunker.chunk('word', 'doc-1', {
        chunk_tokens: 5,
        overlap_tokens: 0,
      });

      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe('word');
    });

    it('should handle overlap equal to chunk size', () => {
      const text = 'word1 word2 word3 word4 word5 word6';
      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 3,
        overlap_tokens: 3,
      });

      // With overlap = chunk_size, step = 0, should still progress
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle multiple whitespace characters', () => {
      const text = 'word1   word2\n\nword3\tword4';
      const chunks = chunker.chunk(text, 'doc-1', {
        chunk_tokens: 2,
        overlap_tokens: 0,
      });

      expect(chunks.length).toBe(2);
      expect(chunks[0].text).toBe('word1 word2');
      expect(chunks[1].text).toBe('word3 word4');
    });
  });

  describe('token estimation', () => {
    it('should estimate token count correctly', () => {
      const text = 'This is a test with five words';
      const tokenCount = chunker.estimateTokens(text);
      
      expect(tokenCount).toBe(7);
    });

    it('should handle empty text', () => {
      const tokenCount = chunker.estimateTokens('');
      expect(tokenCount).toBe(0);
    });

    it('should handle multiple whitespace', () => {
      const text = 'word1   word2\n\nword3';
      const tokenCount = chunker.estimateTokens(text);
      expect(tokenCount).toBe(3);
    });
  });
});
