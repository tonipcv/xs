import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '@/lib/preparation/observability/metrics';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('job tracking', () => {
    it('should start tracking a job', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');

      const metrics = collector.getMetrics('job-1');

      expect(metrics).toBeDefined();
      expect(metrics?.jobId).toBe('job-1');
      expect(metrics?.datasetId).toBe('dataset-1');
      expect(metrics?.task).toBe('rag');
      expect(metrics?.startTime).toBeInstanceOf(Date);
      expect(metrics?.recordsProcessed).toBe(0);
      expect(metrics?.errors).toHaveLength(0);
    });

    it('should complete job tracking', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');

      const completed = collector.completeJob('job-1');

      expect(completed).toBeDefined();
      expect(completed?.endTime).toBeInstanceOf(Date);
      expect(completed?.durationMs).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent job', () => {
      const metrics = collector.getMetrics('non-existent');
      expect(metrics).toBeUndefined();
    });
  });

  describe('stage tracking', () => {
    it('should record normalization stage', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordStage('job-1', 'normalization', 1000);

      const metrics = collector.getMetrics('job-1');
      expect(metrics?.normalizationMs).toBe(1000);
    });

    it('should record compilation stage', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordStage('job-1', 'compilation', 2000);

      const metrics = collector.getMetrics('job-1');
      expect(metrics?.compilationMs).toBe(2000);
    });

    it('should record delivery stage', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordStage('job-1', 'delivery', 500);

      const metrics = collector.getMetrics('job-1');
      expect(metrics?.deliveryMs).toBe(500);
    });

    it('should record all stages', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordStage('job-1', 'normalization', 1000);
      collector.recordStage('job-1', 'compilation', 2000);
      collector.recordStage('job-1', 'delivery', 500);

      const metrics = collector.getMetrics('job-1');
      expect(metrics?.normalizationMs).toBe(1000);
      expect(metrics?.compilationMs).toBe(2000);
      expect(metrics?.deliveryMs).toBe(500);
    });
  });

  describe('processing metrics', () => {
    it('should record processing stats', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordProcessing('job-1', 1000, 50, 5242880);

      const metrics = collector.getMetrics('job-1');
      expect(metrics?.recordsProcessed).toBe(1000);
      expect(metrics?.recordsFiltered).toBe(50);
      expect(metrics?.bytesProcessed).toBe(5242880);
    });

    it('should calculate throughput on completion', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordProcessing('job-1', 1000, 50, 5242880);

      setTimeout(() => {
        const completed = collector.completeJob('job-1');
        expect(completed?.recordsPerSecond).toBeGreaterThan(0);
      }, 100);
    });
  });

  describe('quality metrics', () => {
    it('should record quality metrics', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordQuality('job-1', 0.85, 20);

      const metrics = collector.getMetrics('job-1');
      expect(metrics?.qualityScore).toBe(0.85);
      expect(metrics?.deduplicatedCount).toBe(20);
    });
  });

  describe('error tracking', () => {
    it('should record errors', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordError('job-1', 'normalization', 'Failed to deduplicate');

      const metrics = collector.getMetrics('job-1');
      expect(metrics?.errors).toHaveLength(1);
      expect(metrics?.errors[0].stage).toBe('normalization');
      expect(metrics?.errors[0].message).toBe('Failed to deduplicate');
      expect(metrics?.errors[0].timestamp).toBeInstanceOf(Date);
    });

    it('should record multiple errors', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordError('job-1', 'normalization', 'Error 1');
      collector.recordError('job-1', 'compilation', 'Error 2');

      const metrics = collector.getMetrics('job-1');
      expect(metrics?.errors).toHaveLength(2);
    });
  });

  describe('metrics retrieval', () => {
    it('should get all metrics', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.startJob('job-2', 'dataset-2', 'sft');

      const allMetrics = collector.getAllMetrics();
      expect(allMetrics).toHaveLength(2);
    });

    it('should clear old metrics', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      
      collector.clearOldMetrics(0);

      const allMetrics = collector.getAllMetrics();
      expect(allMetrics).toHaveLength(0);
    });
  });

  describe('summary statistics', () => {
    it('should generate summary stats', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordProcessing('job-1', 1000, 50, 5242880);
      collector.completeJob('job-1');

      collector.startJob('job-2', 'dataset-2', 'sft');
      collector.recordProcessing('job-2', 500, 25, 2621440);
      collector.completeJob('job-2');

      const stats = collector.getSummaryStats();

      expect(stats.totalJobs).toBe(2);
      expect(stats.completedJobs).toBe(2);
      expect(stats.failedJobs).toBe(0);
      expect(stats.totalRecordsProcessed).toBe(1500);
      expect(stats.totalBytesProcessed).toBe(7864320);
      expect(stats.avgDurationMs).toBeGreaterThan(0);
    });

    it('should count failed jobs', () => {
      collector.startJob('job-1', 'dataset-1', 'rag');
      collector.recordError('job-1', 'compilation', 'Failed');

      const stats = collector.getSummaryStats();
      expect(stats.failedJobs).toBe(1);
    });

    it('should handle empty metrics', () => {
      const stats = collector.getSummaryStats();

      expect(stats.totalJobs).toBe(0);
      expect(stats.completedJobs).toBe(0);
      expect(stats.failedJobs).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
      expect(stats.avgRecordsPerSecond).toBe(0);
    });
  });

  describe('medical use cases', () => {
    it('should track clinical dataset preparation', () => {
      collector.startJob('job-clinical', 'clinical-notes', 'rag');
      collector.recordStage('job-clinical', 'normalization', 5000);
      collector.recordProcessing('job-clinical', 10000, 500, 52428800);
      collector.recordQuality('job-clinical', 0.92, 150);
      collector.recordStage('job-clinical', 'compilation', 8000);
      collector.recordStage('job-clinical', 'delivery', 1000);

      const metrics = collector.completeJob('job-clinical');

      expect(metrics?.task).toBe('rag');
      expect(metrics?.recordsProcessed).toBe(10000);
      expect(metrics?.qualityScore).toBe(0.92);
      expect(metrics?.normalizationMs).toBe(5000);
      expect(metrics?.compilationMs).toBe(8000);
      expect(metrics?.deliveryMs).toBe(1000);
    });

    it('should track medical chatbot training', () => {
      collector.startJob('job-chatbot', 'medical-qa', 'sft');
      collector.recordProcessing('job-chatbot', 5000, 200, 10485760);
      collector.recordQuality('job-chatbot', 0.88, 50);

      const metrics = collector.completeJob('job-chatbot');

      expect(metrics?.task).toBe('sft');
      expect(metrics?.recordsProcessed).toBe(5000);
      expect(metrics?.recordsFiltered).toBe(200);
    });
  });
});
