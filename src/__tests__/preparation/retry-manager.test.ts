import { describe, it, expect, beforeEach } from 'vitest';
import { RetryManager } from '@/lib/preparation/retry/retry-manager';

describe('RetryManager', () => {
  let manager: RetryManager;

  beforeEach(() => {
    manager = new RetryManager();
  });

  describe('delay calculation', () => {
    it('should calculate exponential backoff delays', () => {
      const delay0 = manager.calculateDelay(0);
      const delay1 = manager.calculateDelay(1);
      const delay2 = manager.calculateDelay(2);

      expect(delay0).toBeGreaterThanOrEqual(900); // ~1000ms with jitter
      expect(delay0).toBeLessThanOrEqual(1100);
      
      expect(delay1).toBeGreaterThanOrEqual(1800); // ~2000ms with jitter
      expect(delay1).toBeLessThanOrEqual(2200);
      
      expect(delay2).toBeGreaterThanOrEqual(3600); // ~4000ms with jitter
      expect(delay2).toBeLessThanOrEqual(4400);
    });

    it('should cap delay at max delay', () => {
      const delay = manager.calculateDelay(20); // Very high attempt
      expect(delay).toBeLessThanOrEqual(300000); // Max 5 minutes
    });

    it('should add jitter to prevent thundering herd', () => {
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(manager.calculateDelay(1));
      }

      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1); // Should have variation
    });

    it('should use custom config', () => {
      const customConfig = {
        initialDelayMs: 500,
        backoffMultiplier: 3,
      };

      const delay0 = manager.calculateDelay(0, customConfig);
      const delay1 = manager.calculateDelay(1, customConfig);

      expect(delay0).toBeGreaterThanOrEqual(450);
      expect(delay0).toBeLessThanOrEqual(550);
      
      expect(delay1).toBeGreaterThanOrEqual(1350); // 500 * 3
      expect(delay1).toBeLessThanOrEqual(1650);
    });
  });

  describe('retry decision', () => {
    it('should retry on transient errors', () => {
      const error = new Error('Network timeout');
      const shouldRetry = manager.shouldRetry(0, error);
      expect(shouldRetry).toBe(true);
    });

    it('should not retry validation errors', () => {
      const error = new Error('Validation error: invalid config');
      const shouldRetry = manager.shouldRetry(0, error);
      expect(shouldRetry).toBe(false);
    });

    it('should not retry permission errors', () => {
      const error = new Error('Permission denied');
      const shouldRetry = manager.shouldRetry(0, error);
      expect(shouldRetry).toBe(false);
    });

    it('should not retry after max attempts', () => {
      const error = new Error('Temporary error');
      const shouldRetry = manager.shouldRetry(3, error, { maxAttempts: 3 });
      expect(shouldRetry).toBe(false);
    });

    it('should retry before max attempts', () => {
      const error = new Error('Temporary error');
      const shouldRetry = manager.shouldRetry(1, error, { maxAttempts: 3 });
      expect(shouldRetry).toBe(true);
    });
  });

  describe('retry state', () => {
    it('should create retry state', () => {
      const lastAttempt = new Date();
      const state = manager.getRetryState(1, lastAttempt, 'Network error');

      expect(state.attempt).toBe(1);
      expect(state.lastAttemptAt).toBe(lastAttempt);
      expect(state.nextRetryAt).toBeInstanceOf(Date);
      expect(state.nextRetryAt.getTime()).toBeGreaterThan(lastAttempt.getTime());
      expect(state.error).toBe('Network error');
    });

    it('should check if ready for retry', () => {
      const pastTime = new Date(Date.now() - 10000);
      const futureTime = new Date(Date.now() + 10000);

      expect(manager.isReadyForRetry(pastTime)).toBe(true);
      expect(manager.isReadyForRetry(futureTime)).toBe(false);
    });
  });

  describe('delay formatting', () => {
    it('should format milliseconds', () => {
      expect(manager.formatDelay(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(manager.formatDelay(5000)).toBe('5s');
    });

    it('should format minutes', () => {
      expect(manager.formatDelay(120000)).toBe('2m');
    });
  });

  describe('retry summary', () => {
    it('should generate retry summary', () => {
      const summary = manager.getRetrySummary();

      expect(summary.maxAttempts).toBe(3);
      expect(summary.delays).toHaveLength(3);
      expect(summary.totalTime).toBeGreaterThan(0);
    });

    it('should calculate total retry time', () => {
      const totalTime = manager.calculateTotalRetryTime(3);
      expect(totalTime).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(10000); // Should be less than 10 seconds for 3 attempts
    });
  });

  describe('medical use cases', () => {
    it('should retry clinical data processing on transient errors', () => {
      const error = new Error('Database connection timeout');
      const shouldRetry = manager.shouldRetry(0, error);
      expect(shouldRetry).toBe(true);
    });

    it('should not retry on invalid clinical data format', () => {
      const error = new Error('Validation error: invalid DICOM format');
      const shouldRetry = manager.shouldRetry(0, error);
      expect(shouldRetry).toBe(false);
    });

    it('should calculate retry delays for medical imaging pipeline', () => {
      const config = {
        maxAttempts: 5,
        initialDelayMs: 2000,
        maxDelayMs: 60000,
      };

      const summary = manager.getRetrySummary(config);
      expect(summary.maxAttempts).toBe(5);
      expect(summary.delays).toHaveLength(5);
    });

    it('should handle medical chatbot training retries', () => {
      const error = new Error('GPU memory error');
      const shouldRetry = manager.shouldRetry(1, error);
      expect(shouldRetry).toBe(true);

      const delay = manager.calculateDelay(1);
      expect(delay).toBeGreaterThan(0);
    });

    it('should not retry on patient data access denied', () => {
      const error = new Error('Unauthorized: patient data access denied');
      const shouldRetry = manager.shouldRetry(0, error);
      expect(shouldRetry).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle zero attempts', () => {
      const delay = manager.calculateDelay(0);
      expect(delay).toBeGreaterThanOrEqual(0);
    });

    it('should handle very high attempts', () => {
      const delay = manager.calculateDelay(100);
      expect(delay).toBeLessThanOrEqual(300000); // Capped at max
    });

    it('should handle custom max attempts of 1', () => {
      const shouldRetry = manager.shouldRetry(1, new Error('test'), { maxAttempts: 1 });
      expect(shouldRetry).toBe(false);
    });

    it('should handle zero jitter factor', () => {
      const delay = manager.calculateDelay(1, { jitterFactor: 0 });
      expect(delay).toBe(2000); // Exactly 2000ms without jitter
    });
  });

  describe('non-retryable errors', () => {
    const nonRetryableErrors = [
      'Validation error: missing required field',
      'Invalid config: chunk_tokens must be positive',
      'Permission denied: insufficient privileges',
      'Unauthorized: invalid API key',
      'Forbidden: access to resource denied',
      'Not found: dataset does not exist',
      'Bad request: malformed JSON',
    ];

    nonRetryableErrors.forEach(errorMsg => {
      it(`should not retry on: ${errorMsg}`, () => {
        const error = new Error(errorMsg);
        const shouldRetry = manager.shouldRetry(0, error);
        expect(shouldRetry).toBe(false);
      });
    });
  });

  describe('retryable errors', () => {
    const retryableErrors = [
      'Network timeout',
      'Database connection failed',
      'Service temporarily unavailable',
      'Rate limit exceeded',
      'Internal server error',
    ];

    retryableErrors.forEach(errorMsg => {
      it(`should retry on: ${errorMsg}`, () => {
        const error = new Error(errorMsg);
        const shouldRetry = manager.shouldRetry(0, error);
        expect(shouldRetry).toBe(true);
      });
    });
  });
});
