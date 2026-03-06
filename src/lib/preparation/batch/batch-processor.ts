/**
 * Batch Processor for Data Preparation
 * Processes data in configurable batch sizes with parallel execution
 */

export interface BatchConfig {
  batchSize: number;
  maxConcurrency: number;
  timeoutMs: number;
  retryAttempts: number;
  continueOnError: boolean;
}

export interface BatchResult<T> {
  items: T[];
  processedCount: number;
  successCount: number;
  errorCount: number;
  errors: BatchError[];
  durationMs: number;
}

export interface BatchError {
  index: number;
  error: string;
  item?: unknown;
}

export type BatchProcessorFn<T, R> = (items: T[]) => Promise<R[]>;

export class BatchProcessor {
  private config: BatchConfig;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      batchSize: config.batchSize ?? 100,
      maxConcurrency: config.maxConcurrency ?? 5,
      timeoutMs: config.timeoutMs ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
      continueOnError: config.continueOnError ?? true,
    };
  }

  async process<T, R>(
    items: T[],
    processor: BatchProcessorFn<T, R>,
    onProgress?: (processed: number, total: number) => void
  ): Promise<BatchResult<R>> {
    const startTime = Date.now();
    const results: R[] = [];
    const errors: BatchError[] = [];
    
    const batches = this.createBatches(items, this.config.batchSize);
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    // Process batches with limited concurrency
    const semaphore = new Semaphore(this.config.maxConcurrency);

    await Promise.all(
      batches.map(async (batch, batchIndex) => {
        await semaphore.acquire();
        try {
          const batchResults = await this.processBatchWithRetry(
            batch,
            processor,
            batchIndex,
            errors
          );
          
          results.push(...batchResults);
          processedCount += batch.length;
          successCount += batchResults.length;
          errorCount += batch.length - batchResults.length;
          
          onProgress?.(processedCount, items.length);
        } finally {
          semaphore.release();
        }
      })
    );

    return {
      items: results,
      processedCount,
      successCount,
      errorCount,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatchWithRetry<T, R>(
    batch: T[],
    processor: BatchProcessorFn<T, R>,
    batchIndex: number,
    errors: BatchError[]
  ): Promise<R[]> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.config.retryAttempts) {
      try {
        const results = await this.withTimeout(processor(batch));
        return results;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;
        
        if (attempts < this.config.retryAttempts) {
          // Exponential backoff
          await sleep(Math.min(1000 * Math.pow(2, attempts), 10000));
        }
      }
    }

    // All retries failed
    if (!this.config.continueOnError) {
      throw lastError;
    }

    // Log errors for each item in batch
    batch.forEach((item, idx) => {
      errors.push({
        index: batchIndex * this.config.batchSize + idx,
        error: lastError?.message ?? 'Unknown error',
        item,
      });
    });

    return [];
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Batch processing timeout')), this.config.timeoutMs);
      }),
    ]);
  }

  getConfig(): BatchConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Semaphore for limiting concurrency
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
