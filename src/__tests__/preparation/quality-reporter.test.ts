import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QualityReporter, QualityMetrics } from '@/lib/preparation/normalize/quality-reporter';

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('QualityReporter', () => {
  let reporter: QualityReporter;

  beforeEach(() => {
    reporter = new QualityReporter();
  });

  describe('generateReport', () => {
    it('should generate complete quality report', () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 950,
        recordsFiltered: 50,
        deduplicatedCount: 20,
        qualityScoreAvg: 0.85,
        qualityScoreMin: 0.3,
        qualityScoreMax: 1.0,
        filterReasons: {
          low_quality: 30,
          duplicates: 20,
        },
      };

      const report = reporter.generateReport(
        'dataset-123',
        'job-456',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      expect(report.version).toBe('1.0');
      expect(report.datasetId).toBe('dataset-123');
      expect(report.jobId).toBe('job-456');
      expect(report.metrics).toEqual(metrics);
      expect(report.config.deduplicate).toBe(true);
      expect(report.config.quality_threshold).toBe(0.7);
      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.timestamp).toBeDefined();
    });
  });

  describe('recommendations', () => {
    it('should recommend lowering threshold for high filter rate', () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 400,
        recordsFiltered: 600, // 60% filtered
        deduplicatedCount: 10,
        qualityScoreAvg: 0.5,
        qualityScoreMin: 0.2,
        qualityScoreMax: 0.8,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      const hasThresholdRecommendation = report.recommendations.some(r =>
        r.includes('lowering quality_threshold')
      );
      expect(hasThresholdRecommendation).toBe(true);
    });

    it('should recommend increasing threshold for low filter rate', () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 980,
        recordsFiltered: 20, // 2% filtered
        deduplicatedCount: 5,
        qualityScoreAvg: 0.9,
        qualityScoreMin: 0.7,
        qualityScoreMax: 1.0,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.5 }
      );

      const hasThresholdRecommendation = report.recommendations.some(r =>
        r.includes('increasing quality_threshold')
      );
      expect(hasThresholdRecommendation).toBe(true);
    });

    it('should warn about high duplication rate', () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 750,
        recordsFiltered: 250,
        deduplicatedCount: 250, // 25% duplicates
        qualityScoreAvg: 0.8,
        qualityScoreMin: 0.5,
        qualityScoreMax: 1.0,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      const hasDuplicationWarning = report.recommendations.some(r =>
        r.includes('High duplication rate')
      );
      expect(hasDuplicationWarning).toBe(true);
    });

    it('should warn about low quality score', () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 900,
        recordsFiltered: 100,
        deduplicatedCount: 10,
        qualityScoreAvg: 0.45, // Low average
        qualityScoreMin: 0.1,
        qualityScoreMax: 0.8,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.3 }
      );

      const hasQualityWarning = report.recommendations.some(r =>
        r.includes('Low average quality score')
      );
      expect(hasQualityWarning).toBe(true);
    });

    it('should warn about small dataset', () => {
      const metrics: QualityMetrics = {
        totalRecords: 100,
        recordsProcessed: 50, // Small dataset
        recordsFiltered: 50,
        deduplicatedCount: 5,
        qualityScoreAvg: 0.8,
        qualityScoreMin: 0.5,
        qualityScoreMax: 1.0,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      const hasSmallDatasetWarning = report.recommendations.some(r =>
        r.includes('Small dataset size')
      );
      expect(hasSmallDatasetWarning).toBe(true);
    });

    it('should give positive feedback for good quality', () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 950,
        recordsFiltered: 50, // 5% filtered - reasonable
        deduplicatedCount: 10, // 1% duplicates - low
        qualityScoreAvg: 0.85, // High quality
        qualityScoreMin: 0.6,
        qualityScoreMax: 1.0,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      const hasPositiveFeedback = report.recommendations.some(r =>
        r.includes('quality is good')
      );
      expect(hasPositiveFeedback).toBe(true);
    });
  });

  describe('HTML generation', () => {
    it('should generate valid HTML report', () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 950,
        recordsFiltered: 50,
        deduplicatedCount: 20,
        qualityScoreAvg: 0.85,
        qualityScoreMin: 0.3,
        qualityScoreMax: 1.0,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-123',
        'job-456',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      const html = reporter.generateHTML(report);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Quality Report');
      expect(html).toContain('dataset-123');
      expect(html).toContain('job-456');
      expect(html).toContain('1,000'); // Formatted number
      expect(html).toContain('0.85'); // Quality score
      expect(html).toContain(report.recommendations[0]);
    });

    it('should include color coding for metrics', () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 950,
        recordsFiltered: 50,
        deduplicatedCount: 20,
        qualityScoreAvg: 0.85,
        qualityScoreMin: 0.3,
        qualityScoreMax: 1.0,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      const html = reporter.generateHTML(report);

      expect(html).toContain('class="good"');
    });
  });

  describe('file operations', () => {
    it('should save JSON report', async () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 950,
        recordsFiltered: 50,
        deduplicatedCount: 20,
        qualityScoreAvg: 0.85,
        qualityScoreMin: 0.3,
        qualityScoreMax: 1.0,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      const reportPath = await reporter.saveReport(report, '/tmp/reports');

      expect(reportPath).toContain('quality_report.json');
    });

    it('should save HTML report', async () => {
      const metrics: QualityMetrics = {
        totalRecords: 1000,
        recordsProcessed: 950,
        recordsFiltered: 50,
        deduplicatedCount: 20,
        qualityScoreAvg: 0.85,
        qualityScoreMin: 0.3,
        qualityScoreMax: 1.0,
        filterReasons: {},
      };

      const report = reporter.generateReport(
        'dataset-1',
        'job-1',
        metrics,
        { deduplicate: true, quality_threshold: 0.7 }
      );

      const reportPath = await reporter.saveHTMLReport(report, '/tmp/reports');

      expect(reportPath).toContain('quality_report.html');
    });
  });
});
