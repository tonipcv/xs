/**
 * Metrics and Observability for Data Preparation Pipeline
 * Tracks performance, errors, and resource usage
 */

export interface JobMetrics {
  jobId: string;
  datasetId: string;
  task: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  
  // Stage timings
  normalizationMs?: number;
  compilationMs?: number;
  deliveryMs?: number;
  
  // Throughput
  recordsProcessed: number;
  recordsFiltered: number;
  recordsPerSecond?: number;
  bytesProcessed: number;
  
  // Quality
  qualityScore?: number;
  deduplicatedCount?: number;
  
  // Errors
  errors: Array<{
    stage: string;
    message: string;
    timestamp: Date;
  }>;
  
  // Resource usage
  peakMemoryMb?: number;
  cpuTimeMs?: number;
}

export class MetricsCollector {
  private metrics: Map<string, JobMetrics> = new Map();

  /**
   * Start tracking a job
   */
  startJob(jobId: string, datasetId: string, task: string): void {
    this.metrics.set(jobId, {
      jobId,
      datasetId,
      task,
      startTime: new Date(),
      recordsProcessed: 0,
      recordsFiltered: 0,
      bytesProcessed: 0,
      errors: [],
    });
  }

  /**
   * Record stage completion
   */
  recordStage(
    jobId: string,
    stage: 'normalization' | 'compilation' | 'delivery',
    durationMs: number
  ): void {
    const metrics = this.metrics.get(jobId);
    if (!metrics) return;

    if (stage === 'normalization') {
      metrics.normalizationMs = durationMs;
    } else if (stage === 'compilation') {
      metrics.compilationMs = durationMs;
    } else if (stage === 'delivery') {
      metrics.deliveryMs = durationMs;
    }
  }

  /**
   * Record processing stats
   */
  recordProcessing(
    jobId: string,
    recordsProcessed: number,
    recordsFiltered: number,
    bytesProcessed: number
  ): void {
    const metrics = this.metrics.get(jobId);
    if (!metrics) return;

    metrics.recordsProcessed = recordsProcessed;
    metrics.recordsFiltered = recordsFiltered;
    metrics.bytesProcessed = bytesProcessed;
  }

  /**
   * Record quality metrics
   */
  recordQuality(
    jobId: string,
    qualityScore: number,
    deduplicatedCount: number
  ): void {
    const metrics = this.metrics.get(jobId);
    if (!metrics) return;

    metrics.qualityScore = qualityScore;
    metrics.deduplicatedCount = deduplicatedCount;
  }

  /**
   * Record error
   */
  recordError(jobId: string, stage: string, message: string): void {
    const metrics = this.metrics.get(jobId);
    if (!metrics) return;

    metrics.errors.push({
      stage,
      message,
      timestamp: new Date(),
    });
  }

  /**
   * Complete job tracking
   */
  completeJob(jobId: string): JobMetrics | undefined {
    const metrics = this.metrics.get(jobId);
    if (!metrics) return undefined;

    metrics.endTime = new Date();
    metrics.durationMs = metrics.endTime.getTime() - metrics.startTime.getTime();

    if (metrics.durationMs > 0 && metrics.recordsProcessed > 0) {
      metrics.recordsPerSecond = (metrics.recordsProcessed / metrics.durationMs) * 1000;
    }

    return metrics;
  }

  /**
   * Get metrics for a job
   */
  getMetrics(jobId: string): JobMetrics | undefined {
    return this.metrics.get(jobId);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): JobMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear old metrics (cleanup)
   */
  clearOldMetrics(olderThanHours: number = 24): void {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    for (const [jobId, metrics] of this.metrics.entries()) {
      if (metrics.startTime < cutoff) {
        this.metrics.delete(jobId);
      }
    }
  }

  /**
   * Generate summary statistics
   */
  getSummaryStats(): {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    avgDurationMs: number;
    avgRecordsPerSecond: number;
    totalRecordsProcessed: number;
    totalBytesProcessed: number;
  } {
    const allMetrics = this.getAllMetrics();
    const completed = allMetrics.filter(m => m.endTime);
    const failed = allMetrics.filter(m => m.errors.length > 0);

    const avgDuration = completed.length > 0
      ? completed.reduce((sum, m) => sum + (m.durationMs || 0), 0) / completed.length
      : 0;

    const avgThroughput = completed.length > 0
      ? completed.reduce((sum, m) => sum + (m.recordsPerSecond || 0), 0) / completed.length
      : 0;

    return {
      totalJobs: allMetrics.length,
      completedJobs: completed.length,
      failedJobs: failed.length,
      avgDurationMs: avgDuration,
      avgRecordsPerSecond: avgThroughput,
      totalRecordsProcessed: allMetrics.reduce((sum, m) => sum + m.recordsProcessed, 0),
      totalBytesProcessed: allMetrics.reduce((sum, m) => sum + m.bytesProcessed, 0),
    };
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();
