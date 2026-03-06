import { describe, it, expect, vi } from 'vitest';
import { BatchProcessor, BatchConfig } from '@/lib/preparation/batch/batch-processor';

describe('BatchProcessor', () => {
  const createProcessor = (config?: Partial<BatchConfig>) => new BatchProcessor(config);

  describe('basic processing', () => {
    it('should process items in batches', async () => {
      const processor = createProcessor({ batchSize: 3, maxConcurrency: 2 });
      const items = [1, 2, 3, 4, 5, 6, 7];
      
      const result = await processor.process(
        items,
        async (batch) => batch.map((x) => x * 2)
      );

      expect(result.successCount).toBe(7);
      expect(result.items).toEqual([2, 4, 6, 8, 10, 12, 14]);
      expect(result.errorCount).toBe(0);
    });

    it('should handle empty arrays', async () => {
      const processor = createProcessor();
      
      const result = await processor.process(
        [],
        async (batch) => batch.map((x) => x * 2)
      );

      expect(result.items).toHaveLength(0);
      expect(result.processedCount).toBe(0);
    });

    it('should track progress', async () => {
      const processor = createProcessor({ batchSize: 2 });
      const items = [1, 2, 3, 4];
      const progressFn = vi.fn();
      
      await processor.process(
        items,
        async (batch) => batch.map((x) => x * 2),
        progressFn
      );

      expect(progressFn).toHaveBeenCalled();
      // Progress callback receives (processed, total)
      const lastCall = progressFn.mock.calls[progressFn.mock.calls.length - 1];
      expect(lastCall[0]).toBe(4); // processed
      expect(lastCall[1]).toBe(4); // total
    });
  });

  describe('error handling', () => {
    it('should handle batch errors with continueOnError', async () => {
      const processor = createProcessor({
        batchSize: 2,
        continueOnError: true,
        retryAttempts: 1,
      });
      
      const result = await processor.process(
        [1, 2, 3, 4],
        async (batch) => {
          if (batch.includes(3)) throw new Error('Test error');
          return batch.map((x) => x * 2);
        }
      );

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it('should throw on first error when continueOnError is false', async () => {
      const processor = createProcessor({
        batchSize: 2,
        continueOnError: false,
        retryAttempts: 1,
      });
      
      await expect(
        processor.process(
          [1, 2, 3, 4],
          async () => {
            throw new Error('Test error');
          }
        )
      ).rejects.toThrow('Test error');
    });

    it('should retry on failure', async () => {
      const processor = createProcessor({
        batchSize: 2,
        retryAttempts: 3,
        continueOnError: false,
      });
      
      let attempts = 0;
      const result = await processor.process(
        [1, 2],
        async (batch) => {
          attempts++;
          if (attempts < 2) throw new Error('Retry me');
          return batch.map((x) => x * 2);
        }
      );

      expect(attempts).toBe(2);
      expect(result.successCount).toBe(2);
    });
  });

  describe('concurrency', () => {
    it('should respect maxConcurrency limit', async () => {
      const processor = createProcessor({
        batchSize: 1,
        maxConcurrency: 2,
      });
      
      let concurrentCount = 0;
      let maxConcurrent = 0;
      
      await processor.process(
        [1, 2, 3, 4, 5, 6],
        async (batch) => {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
          await new Promise((resolve) => setTimeout(resolve, 10));
          concurrentCount--;
          return batch.map((x) => x * 2);
        }
      );

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running batches', async () => {
      const processor = createProcessor({
        batchSize: 1,
        timeoutMs: 50,
        continueOnError: true,
        retryAttempts: 1,
      });
      
      const result = await processor.process(
        [1, 2],
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return [1];
        }
      );

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('timeout');
    });
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const processor = createProcessor();
      const config = processor.getConfig();

      expect(config.batchSize).toBe(100);
      expect(config.maxConcurrency).toBe(5);
      expect(config.timeoutMs).toBe(30000);
      expect(config.retryAttempts).toBe(3);
      expect(config.continueOnError).toBe(true);
    });

    it('should allow custom config', () => {
      const processor = createProcessor({
        batchSize: 50,
        maxConcurrency: 10,
      });
      const config = processor.getConfig();

      expect(config.batchSize).toBe(50);
      expect(config.maxConcurrency).toBe(10);
    });

    it('should update config', () => {
      const processor = createProcessor();
      processor.updateConfig({ batchSize: 200 });
      const config = processor.getConfig();

      expect(config.batchSize).toBe(200);
      expect(config.maxConcurrency).toBe(5); // unchanged
    });
  });

  describe('medical use cases', () => {
    it('should process clinical records in batches', async () => {
      const processor = createProcessor({ batchSize: 100 });
      
      const records = Array.from({ length: 1000 }, (_, i) => ({
        id: `patient-${i}`,
        diagnosis: i % 2 === 0 ? 'healthy' : 'diabetic',
        age: 30 + (i % 70),
      }));

      const result = await processor.process(
        records,
        async (batch) => batch.map((r) => ({ ...r, processed: true }))
      );

      expect(result.processedCount).toBe(1000);
      expect(result.successCount).toBe(1000);
      expect(result.items[0].processed).toBe(true);
    });

    it('should handle large medical datasets', async () => {
      const processor = createProcessor({
        batchSize: 500,
        maxConcurrency: 3,
      });
      
      const records = Array.from({ length: 10000 }, (_, i) => ({
        patientId: `P${i}`,
        notes: `Clinical notes for patient ${i}`,
      }));

      const startTime = Date.now();
      const result = await processor.process(
        records,
        async (batch) => batch.map((r) => ({ ...r, tokenized: true }))
      );
      const duration = Date.now() - startTime;

      expect(result.processedCount).toBe(10000);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });
});
