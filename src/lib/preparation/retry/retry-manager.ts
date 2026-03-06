/**
 * Retry Manager for Data Preparation Pipeline
 * Implements exponential backoff with jitter for failed jobs
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface RetryState {
  attempt: number;
  lastAttemptAt: Date;
  nextRetryAt: Date;
  error: string;
}

export class RetryManager {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000, // 1 second
    maxDelayMs: 300000, // 5 minutes
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  };

  /**
   * Calculate next retry delay using exponential backoff with jitter
   */
  calculateDelay(attempt: number, config?: Partial<RetryConfig>): number {
    const cfg = { ...this.defaultConfig, ...config };

    // Exponential backoff: delay = initialDelay * (multiplier ^ attempt)
    const exponentialDelay = cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, cfg.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * cfg.jitterFactor * (Math.random() - 0.5);
    const finalDelay = Math.min(cappedDelay + jitter, cfg.maxDelayMs);

    return Math.max(0, Math.floor(finalDelay));
  }

  /**
   * Calculate next retry time
   */
  calculateNextRetryTime(attempt: number, config?: Partial<RetryConfig>): Date {
    const delay = this.calculateDelay(attempt, config);
    const nextRetry = new Date();
    nextRetry.setMilliseconds(nextRetry.getMilliseconds() + delay);
    return nextRetry;
  }

  /**
   * Check if job should be retried
   */
  shouldRetry(attempt: number, error: Error, config?: Partial<RetryConfig>): boolean {
    const cfg = { ...this.defaultConfig, ...config };

    // Don't retry if max attempts reached
    if (attempt >= cfg.maxAttempts) {
      return false;
    }

    // Don't retry for certain error types
    if (this.isNonRetryableError(error)) {
      return false;
    }

    return true;
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
      /validation error/i,
      /invalid config/i,
      /permission denied/i,
      /unauthorized/i,
      /forbidden/i,
      /not found/i,
      /bad request/i,
    ];

    return nonRetryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Get retry state for job
   */
  getRetryState(
    attempt: number,
    lastAttemptAt: Date,
    error: string,
    config?: Partial<RetryConfig>
  ): RetryState {
    return {
      attempt,
      lastAttemptAt,
      nextRetryAt: this.calculateNextRetryTime(attempt, config),
      error,
    };
  }

  /**
   * Check if job is ready for retry
   */
  isReadyForRetry(nextRetryAt: Date): boolean {
    return new Date() >= nextRetryAt;
  }

  /**
   * Get human-readable retry delay
   */
  formatDelay(delayMs: number): string {
    if (delayMs < 1000) {
      return `${delayMs}ms`;
    } else if (delayMs < 60000) {
      return `${Math.floor(delayMs / 1000)}s`;
    } else {
      return `${Math.floor(delayMs / 60000)}m`;
    }
  }

  /**
   * Calculate total time spent on retries
   */
  calculateTotalRetryTime(attempts: number, config?: Partial<RetryConfig>): number {
    let totalTime = 0;
    for (let i = 0; i < attempts; i++) {
      totalTime += this.calculateDelay(i, config);
    }
    return totalTime;
  }

  /**
   * Get retry strategy summary
   */
  getRetrySummary(config?: Partial<RetryConfig>): {
    maxAttempts: number;
    delays: number[];
    totalTime: number;
  } {
    const cfg = { ...this.defaultConfig, ...config };
    const delays: number[] = [];

    for (let i = 0; i < cfg.maxAttempts; i++) {
      delays.push(this.calculateDelay(i, config));
    }

    const totalTime = delays.reduce((sum, delay) => sum + delay, 0);

    return {
      maxAttempts: cfg.maxAttempts,
      delays,
      totalTime,
    };
  }
}

/**
 * Singleton instance
 */
export const retryManager = new RetryManager();
