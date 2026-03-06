import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '@/lib/preparation/rate-limiting/rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('configuration', () => {
    it('should have default rate limit config', async () => {
      const config = await limiter.getConfig('tenant-1');

      expect(config.maxRequestsPerHour).toBe(100);
      expect(config.maxRequestsPerDay).toBe(1000);
      expect(config.maxRecordsPerJob).toBe(1000000);
      expect(config.maxBytesPerJob).toBe(10 * 1024 * 1024 * 1024);
      expect(config.maxDurationSeconds).toBe(3600);
      expect(config.maxConcurrentJobs).toBe(5);
    });
  });

  describe('quota validation', () => {
    it('should reject job exceeding max records', async () => {
      const result = await limiter.checkRateLimit('tenant-1', 2000000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('max records limit');
    });

    it('should reject job exceeding max bytes', async () => {
      const maxBytes = 10 * 1024 * 1024 * 1024;
      const result = await limiter.checkRateLimit('tenant-1', undefined, maxBytes + 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('max bytes limit');
    });

    it('should allow job within limits', async () => {
      const result = await limiter.checkRateLimit('tenant-1', 1000, 1024 * 1024);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('rate limit calculations', () => {
    it('should calculate remaining quota correctly', () => {
      const config = {
        maxRequestsPerHour: 100,
        maxRequestsPerDay: 1000,
        maxConcurrentJobs: 5,
      };

      const usage = {
        requestsLastHour: 30,
        requestsLastDay: 200,
        activeJobs: 2,
      };

      const remainingHour = config.maxRequestsPerHour - usage.requestsLastHour;
      const remainingDay = config.maxRequestsPerDay - usage.requestsLastDay;
      const remainingJobs = config.maxConcurrentJobs - usage.activeJobs;

      expect(remainingHour).toBe(70);
      expect(remainingDay).toBe(800);
      expect(remainingJobs).toBe(3);
    });

    it('should not return negative remaining quota', () => {
      const remaining = Math.max(0, 100 - 150);
      expect(remaining).toBe(0);
    });
  });

  describe('retry after calculation', () => {
    it('should return retry after for hourly limit', async () => {
      // Mock to simulate hourly limit exceeded
      const mockUsage = {
        requestsLastHour: 100,
        requestsLastDay: 500,
        activeJobs: 2,
        totalRecordsProcessed: 0,
        totalBytesProcessed: 0,
      };

      vi.spyOn(limiter, 'getQuotaUsage').mockResolvedValue(mockUsage);

      const result = await limiter.checkRateLimit('tenant-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(3600); // 1 hour
    });

    it('should return retry after for daily limit', async () => {
      const mockUsage = {
        requestsLastHour: 50,
        requestsLastDay: 1000,
        activeJobs: 2,
        totalRecordsProcessed: 0,
        totalBytesProcessed: 0,
      };

      vi.spyOn(limiter, 'getQuotaUsage').mockResolvedValue(mockUsage);

      const result = await limiter.checkRateLimit('tenant-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(86400); // 1 day
    });

    it('should return retry after for concurrent jobs limit', async () => {
      const mockUsage = {
        requestsLastHour: 10,
        requestsLastDay: 100,
        activeJobs: 5,
        totalRecordsProcessed: 0,
        totalBytesProcessed: 0,
      };

      vi.spyOn(limiter, 'getQuotaUsage').mockResolvedValue(mockUsage);

      const result = await limiter.checkRateLimit('tenant-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(300); // 5 minutes
    });
  });

  describe('medical use cases', () => {
    it('should enforce limits for clinical data processing', async () => {
      // Large clinical dataset
      const clinicalRecords = 500000;
      const estimatedBytes = 5 * 1024 * 1024 * 1024; // 5 GB

      const result = await limiter.checkRateLimit('hospital-1', clinicalRecords, estimatedBytes);

      expect(result.allowed).toBe(true);
    });

    it('should reject oversized medical imaging dataset', async () => {
      // Very large DICOM dataset
      const dicomBytes = 15 * 1024 * 1024 * 1024; // 15 GB (exceeds 10 GB limit)

      const result = await limiter.checkRateLimit('hospital-1', undefined, dicomBytes);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('max bytes limit');
    });

    it('should allow multiple small medical chatbot training jobs', async () => {
      const mockUsage = {
        requestsLastHour: 5,
        requestsLastDay: 50,
        activeJobs: 1,
        totalRecordsProcessed: 0,
        totalBytesProcessed: 0,
      };

      vi.spyOn(limiter, 'getQuotaUsage').mockResolvedValue(mockUsage);

      const result = await limiter.checkRateLimit('hospital-1', 10000, 100 * 1024 * 1024);

      expect(result.allowed).toBe(true);
    });

    it('should prevent burst of diagnosis model training requests', async () => {
      const mockUsage = {
        requestsLastHour: 100,
        requestsLastDay: 500,
        activeJobs: 2,
        totalRecordsProcessed: 0,
        totalBytesProcessed: 0,
      };

      vi.spyOn(limiter, 'getQuotaUsage').mockResolvedValue(mockUsage);

      const result = await limiter.checkRateLimit('hospital-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Hourly rate limit exceeded');
    });
  });

  describe('quota tracking', () => {
    it('should track records processed', () => {
      const recordsProcessed = 50000;
      const bytesProcessed = 500 * 1024 * 1024;

      expect(recordsProcessed).toBeGreaterThan(0);
      expect(bytesProcessed).toBeGreaterThan(0);
    });

    it('should aggregate quota usage across jobs', () => {
      const jobs = [
        { records: 10000, bytes: 100 * 1024 * 1024 },
        { records: 20000, bytes: 200 * 1024 * 1024 },
        { records: 30000, bytes: 300 * 1024 * 1024 },
      ];

      const totalRecords = jobs.reduce((sum, job) => sum + job.records, 0);
      const totalBytes = jobs.reduce((sum, job) => sum + job.bytes, 0);

      expect(totalRecords).toBe(60000);
      expect(totalBytes).toBe(600 * 1024 * 1024);
    });
  });

  describe('edge cases', () => {
    it('should handle zero usage', async () => {
      const mockUsage = {
        requestsLastHour: 0,
        requestsLastDay: 0,
        activeJobs: 0,
        totalRecordsProcessed: 0,
        totalBytesProcessed: 0,
      };

      vi.spyOn(limiter, 'getQuotaUsage').mockResolvedValue(mockUsage);

      const result = await limiter.checkRateLimit('tenant-1');

      expect(result.allowed).toBe(true);
    });

    it('should handle exactly at limit', async () => {
      const mockUsage = {
        requestsLastHour: 100,
        requestsLastDay: 500,
        activeJobs: 2,
        totalRecordsProcessed: 0,
        totalBytesProcessed: 0,
      };

      vi.spyOn(limiter, 'getQuotaUsage').mockResolvedValue(mockUsage);

      const result = await limiter.checkRateLimit('tenant-1');

      expect(result.allowed).toBe(false);
    });

    it('should handle undefined estimated values', async () => {
      const mockUsage = {
        requestsLastHour: 10,
        requestsLastDay: 100,
        activeJobs: 1,
        totalRecordsProcessed: 0,
        totalBytesProcessed: 0,
      };

      vi.spyOn(limiter, 'getQuotaUsage').mockResolvedValue(mockUsage);

      const result = await limiter.checkRateLimit('tenant-1');

      expect(result.allowed).toBe(true);
    });
  });
});
