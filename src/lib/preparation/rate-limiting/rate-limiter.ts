/**
 * Rate Limiter for Data Preparation Pipeline
 * Enforces quotas and rate limits per tenant
 */

import { prisma } from '@/lib/prisma';

export interface RateLimitConfig {
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
  maxRecordsPerJob: number;
  maxBytesPerJob: number;
  maxDurationSeconds: number;
  maxConcurrentJobs: number;
}

export interface QuotaUsage {
  requestsLastHour: number;
  requestsLastDay: number;
  activeJobs: number;
  totalRecordsProcessed: number;
  totalBytesProcessed: number;
}

export class RateLimiter {
  private readonly defaultConfig: RateLimitConfig = {
    maxRequestsPerHour: 100,
    maxRequestsPerDay: 1000,
    maxRecordsPerJob: 1000000,
    maxBytesPerJob: 10 * 1024 * 1024 * 1024, // 10 GB
    maxDurationSeconds: 3600, // 1 hour
    maxConcurrentJobs: 5,
  };

  /**
   * Get rate limit config for tenant (can be customized per tier)
   */
  async getConfig(tenantId: string): Promise<RateLimitConfig> {
    // In production, fetch from tenant settings or plan tier
    // For now, return default
    return this.defaultConfig;
  }

  /**
   * Get current quota usage for tenant
   */
  async getQuotaUsage(tenantId: string): Promise<QuotaUsage> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Count requests in last hour
    const requestsLastHour = await prisma.preparationJob.count({
      where: {
        tenantId,
        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    // Count requests in last day
    const requestsLastDay = await prisma.preparationJob.count({
      where: {
        tenantId,
        createdAt: {
          gte: oneDayAgo,
        },
      },
    });

    // Count active jobs
    const activeJobs = await prisma.preparationJob.count({
      where: {
        tenantId,
        status: {
          in: ['pending', 'normalizing', 'compiling', 'delivering'],
        },
      },
    });

    // Get total records and bytes (from completed jobs)
    const completedJobs = await prisma.preparationJob.findMany({
      where: {
        tenantId,
        status: 'completed',
        createdAt: {
          gte: oneDayAgo,
        },
      },
      select: {
        compilationResult: true,
      },
    });

    let totalRecordsProcessed = 0;
    let totalBytesProcessed = 0;

    for (const job of completedJobs) {
      const result = job.compilationResult as any;
      if (result?.recordCount) {
        totalRecordsProcessed += result.recordCount;
      }
      if (result?.totalSizeBytes) {
        totalBytesProcessed += result.totalSizeBytes;
      }
    }

    return {
      requestsLastHour,
      requestsLastDay,
      activeJobs,
      totalRecordsProcessed,
      totalBytesProcessed,
    };
  }

  /**
   * Check if request is allowed under rate limits
   */
  async checkRateLimit(
    tenantId: string,
    estimatedRecords?: number,
    estimatedBytes?: number
  ): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    const config = await this.getConfig(tenantId);
    const usage = await this.getQuotaUsage(tenantId);

    // Check hourly rate limit
    if (usage.requestsLastHour >= config.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: `Hourly rate limit exceeded (${config.maxRequestsPerHour} requests/hour)`,
        retryAfter: 3600, // seconds
      };
    }

    // Check daily rate limit
    if (usage.requestsLastDay >= config.maxRequestsPerDay) {
      return {
        allowed: false,
        reason: `Daily rate limit exceeded (${config.maxRequestsPerDay} requests/day)`,
        retryAfter: 86400, // seconds
      };
    }

    // Check concurrent jobs limit
    if (usage.activeJobs >= config.maxConcurrentJobs) {
      return {
        allowed: false,
        reason: `Concurrent jobs limit exceeded (${config.maxConcurrentJobs} jobs)`,
        retryAfter: 300, // 5 minutes
      };
    }

    // Check per-job limits
    if (estimatedRecords && estimatedRecords > config.maxRecordsPerJob) {
      return {
        allowed: false,
        reason: `Job exceeds max records limit (${config.maxRecordsPerJob} records)`,
      };
    }

    if (estimatedBytes && estimatedBytes > config.maxBytesPerJob) {
      return {
        allowed: false,
        reason: `Job exceeds max bytes limit (${config.maxBytesPerJob} bytes)`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record job start for rate limiting
   */
  async recordJobStart(tenantId: string, jobId: string): Promise<void> {
    // Job is already created in DB, no additional action needed
    // This method is for future extensions (e.g., Redis counters)
  }

  /**
   * Record job completion for quota tracking
   */
  async recordJobCompletion(
    tenantId: string,
    jobId: string,
    recordsProcessed: number,
    bytesProcessed: number
  ): Promise<void> {
    // Update job with final metrics
    // This is already done in the compilation result
    // This method is for future extensions (e.g., quota aggregation)
  }

  /**
   * Get remaining quota for tenant
   */
  async getRemainingQuota(tenantId: string): Promise<{
    requestsRemainingHour: number;
    requestsRemainingDay: number;
    concurrentJobsRemaining: number;
  }> {
    const config = await this.getConfig(tenantId);
    const usage = await this.getQuotaUsage(tenantId);

    return {
      requestsRemainingHour: Math.max(0, config.maxRequestsPerHour - usage.requestsLastHour),
      requestsRemainingDay: Math.max(0, config.maxRequestsPerDay - usage.requestsLastDay),
      concurrentJobsRemaining: Math.max(0, config.maxConcurrentJobs - usage.activeJobs),
    };
  }
}

/**
 * Singleton instance
 */
export const rateLimiter = new RateLimiter();
