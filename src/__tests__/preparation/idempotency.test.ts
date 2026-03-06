import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdempotencyManager } from '@/lib/preparation/idempotency/idempotency-manager';

describe('IdempotencyManager', () => {
  let manager: IdempotencyManager;

  beforeEach(() => {
    manager = new IdempotencyManager();
  });

  describe('request hashing', () => {
    it('should generate consistent hash for same request', () => {
      const request1 = { datasetId: 'ds-1', task: 'rag', config: { chunk_tokens: 512 } };
      const request2 = { datasetId: 'ds-1', task: 'rag', config: { chunk_tokens: 512 } };

      // Access private method via any for testing
      const hash1 = (manager as any).hashRequest(request1);
      const hash2 = (manager as any).hashRequest(request2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });

    it('should generate different hash for different requests', () => {
      const request1 = { datasetId: 'ds-1', task: 'rag' };
      const request2 = { datasetId: 'ds-1', task: 'sft' };

      const hash1 = (manager as any).hashRequest(request1);
      const hash2 = (manager as any).hashRequest(request2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('idempotency validation', () => {
    it('should detect idempotency key conflict with different request body', async () => {
      const idempotencyKey = 'test-key-123';
      const datasetId = 'ds-1';
      const tenantId = 'tenant-1';
      const request1 = { task: 'rag' };
      const request2 = { task: 'sft' };

      // Mock prisma to return existing record with different hash
      const mockPrisma = {
        idempotencyRecord: {
          findFirst: vi.fn().mockResolvedValue({
            id: '1',
            idempotencyKey,
            datasetId,
            tenantId,
            requestHash: (manager as any).hashRequest(request1),
            jobId: 'job-1',
            response: {},
            expiresAt: new Date(Date.now() + 86400000),
          }),
        },
      };

      // Replace prisma temporarily
      const originalPrisma = (manager as any).prisma;
      (manager as any).prisma = mockPrisma;

      await expect(
        manager.checkIdempotency(idempotencyKey, datasetId, tenantId, request2)
      ).rejects.toThrow('Idempotency key conflict');

      (manager as any).prisma = originalPrisma;
    });
  });

  describe('medical use cases', () => {
    it('should handle clinical data preparation idempotency', () => {
      const clinicalRequest = {
        datasetId: 'clinical-notes-001',
        task: 'rag',
        config: {
          chunk_tokens: 512,
          overlap_tokens: 50,
          deid: true,
          quality_threshold: 0.8,
        },
      };

      const hash = (manager as any).hashRequest(clinicalRequest);
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });

    it('should handle medical chatbot training idempotency', () => {
      const chatbotRequest = {
        datasetId: 'medical-qa-001',
        task: 'sft',
        config: {
          template: 'chatml',
          system_prompt: 'You are a medical AI assistant.',
          quality_threshold: 0.9,
        },
      };

      const hash = (manager as any).hashRequest(chatbotRequest);
      expect(hash).toBeDefined();
    });

    it('should handle diagnosis model evaluation idempotency', () => {
      const evalRequest = {
        datasetId: 'diagnosis-001',
        task: 'eval',
        config: {
          split_ratios: { train: 0.7, test: 0.2, val: 0.1 },
          stratify_by: 'diagnosis',
          seed: 42,
        },
      };

      const hash = (manager as any).hashRequest(evalRequest);
      expect(hash).toBeDefined();
    });

    it('should prevent duplicate clinical data processing', () => {
      const request1 = {
        datasetId: 'clinical-notes-001',
        task: 'rag',
        config: { chunk_tokens: 512 },
      };
      const request2 = {
        datasetId: 'clinical-notes-001',
        task: 'rag',
        config: { chunk_tokens: 512 },
      };

      const hash1 = (manager as any).hashRequest(request1);
      const hash2 = (manager as any).hashRequest(request2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('TTL and expiration', () => {
    it('should use default TTL of 24 hours', () => {
      expect((manager as any).defaultTTLHours).toBe(24);
    });

    it('should calculate correct expiration time', () => {
      const now = new Date();
      const ttlHours = 24;
      const expiresAt = new Date(now);
      expiresAt.setHours(expiresAt.getHours() + ttlHours);

      const diff = expiresAt.getTime() - now.getTime();
      const hoursDiff = diff / (1000 * 60 * 60);

      expect(hoursDiff).toBeCloseTo(24, 0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty request body', () => {
      const hash = (manager as any).hashRequest({});
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });

    it('should handle complex nested objects', () => {
      const complexRequest = {
        datasetId: 'ds-1',
        config: {
          nested: {
            deep: {
              value: 'test',
              array: [1, 2, 3],
            },
          },
        },
      };

      const hash = (manager as any).hashRequest(complexRequest);
      expect(hash).toBeDefined();
    });

    it('should handle null values', () => {
      const request = {
        datasetId: 'ds-1',
        config: null,
      };

      const hash = (manager as any).hashRequest(request);
      expect(hash).toBeDefined();
    });
  });
});
