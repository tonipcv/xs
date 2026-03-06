import { describe, it, expect, vi } from 'vitest';
import { PIIMetricsLogger, PIIMetrics } from '@/lib/preparation/deid/pii-metrics-logger';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

describe('PIIMetricsLogger', () => {
  const createMockAuditLogger = () => ({
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogger);

  const createLogger = () => new PIIMetricsLogger(createMockAuditLogger());

  const createSampleMetrics = (): Omit<PIIMetrics, 'timestamp'> => ({
    datasetId: 'ds-123',
    jobId: 'job-456',
    tenantId: 'tenant-abc',
    entitiesRemoved: {
      name: 5,
      ssn: 2,
      mrn: 3,
      phone: 4,
      email: 2,
      address: 1,
      dob: 3,
      date: 6,
      id: 8,
      other: 0,
    },
    totalEntitiesRemoved: 34,
    recordsProcessed: 100,
    recordsWithPII: 45,
    strategy: 'mask',
    confidence: {
      high: 25,
      medium: 7,
      low: 2,
    },
  });

  describe('logging', () => {
    it('should log metrics without leaking PII content', async () => {
      const auditLogger = createMockAuditLogger();
      const logger = new PIIMetricsLogger(auditLogger);
      const metrics = createSampleMetrics();

      await logger.logMetrics(metrics);

      expect(auditLogger.log).toHaveBeenCalledWith(
        'system',
        'tenant-abc',
        'preparation.data.access',
        'pii_deidentification',
        'ds-123',
        expect.objectContaining({
          purpose: 'deidentification',
          metadata: expect.objectContaining({
            jobId: 'job-456',
            entitiesRemoved: metrics.entitiesRemoved,
            totalEntitiesRemoved: 34,
            recordsProcessed: 100,
            recordsWithPII: 45,
            strategy: 'mask',
          }),
        })
      );
    });

    it('should NOT include actual PII values in logs', async () => {
      const auditLogger = createMockAuditLogger();
      const logger = new PIIMetricsLogger(auditLogger);
      const metrics = createSampleMetrics();

      await logger.logMetrics(metrics);

      const callArgs = auditLogger.log.mock.calls[0];
      const metadata = callArgs[5].metadata;

      // Verify only counts are present, no actual values
      expect(metadata.entitiesRemoved.name).toBe(5);
      expect(metadata.entitiesRemoved.ssn).toBe(2);
      // Should NOT have actual SSN values
      expect(JSON.stringify(metadata)).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    });

    it('should log batch metrics aggregated', async () => {
      const auditLogger = createMockAuditLogger();
      const logger = new PIIMetricsLogger(auditLogger);

      const results = [
        { entitiesDetected: 2, entityTypes: ['name', 'ssn'], confidence: 0.95 },
        { entitiesDetected: 1, entityTypes: ['email'], confidence: 0.8 },
        { entitiesDetected: 0, entityTypes: [], confidence: 1.0 },
      ];

      await logger.logBatchMetrics('ds-123', 'job-456', 'tenant-abc', results, 'redact');

      expect(auditLogger.log).toHaveBeenCalled();
      const metadata = auditLogger.log.mock.calls[0][5].metadata;
      expect(metadata.recordsProcessed).toBe(3);
      expect(metadata.recordsWithPII).toBe(2);
      expect(metadata.totalEntitiesRemoved).toBe(3);
    });
  });

  describe('reporting', () => {
    it('should generate period report', async () => {
      const logger = createLogger();
      
      // Log some metrics
      await logger.logMetrics(createSampleMetrics());
      await logger.logMetrics({
        ...createSampleMetrics(),
        datasetId: 'ds-456',
      });

      const start = new Date(Date.now() - 1000);
      const end = new Date(Date.now() + 1000);
      const report = logger.generateReport(start, end);

      expect(report.totalDatasets).toBe(2);
      expect(report.totalRecordsProcessed).toBe(200);
      expect(report.totalPIIRemoved).toBe(68);
      expect(report.breakdownByType.name).toBe(10);
      expect(report.breakdownByType.ssn).toBe(4);
    });

    it('should calculate average confidence', async () => {
      const logger = createLogger();
      
      await logger.logMetrics(createSampleMetrics());

      const start = new Date(Date.now() - 1000);
      const end = new Date(Date.now() + 1000);
      const report = logger.generateReport(start, end);

      expect(report.averageConfidence).toBeGreaterThan(0);
      expect(report.averageConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('realtime stats', () => {
    it('should get today stats', async () => {
      const logger = createLogger();
      
      await logger.logMetrics(createSampleMetrics());

      const stats = logger.getRealtimeStats();

      expect(stats.totalDatasetsToday).toBe(1);
      expect(stats.totalRecordsToday).toBe(100);
      expect(stats.totalPIIRemovedToday).toBe(34);
      expect(stats.topEntityType).toBeDefined();
    });
  });

  describe('export', () => {
    it('should export metrics without PII', async () => {
      const logger = createLogger();
      
      await logger.logMetrics(createSampleMetrics());

      const exported = logger.exportMetrics();

      expect(exported).toHaveLength(1);
      expect(exported[0].datasetId).toBe('ds-123');
      expect(exported[0].totalEntitiesRemoved).toBe(34);
      // Should not contain actual values
      expect(JSON.stringify(exported)).not.toContain('123-45-6789');
    });
  });

  describe('purge', () => {
    it('should purge old metrics', async () => {
      const logger = createLogger();
      
      await logger.logMetrics(createSampleMetrics());

      const purged = logger.purgeMetrics(new Date(Date.now() + 1000));

      expect(purged).toBe(1);
      expect(logger.exportMetrics()).toHaveLength(0);
    });
  });

  describe('safety verification', () => {
    it('should verify metrics contain no PII', () => {
      const safeMetrics: PIIMetrics = {
        timestamp: new Date(),
        datasetId: 'ds-123',
        jobId: 'job-456',
        tenantId: 'tenant-abc',
        entitiesRemoved: {
          name: 5,
          ssn: 2,
          mrn: 3,
          phone: 4,
          email: 2,
          address: 1,
          dob: 3,
          date: 6,
          id: 8,
          other: 0,
        },
        totalEntitiesRemoved: 34,
        recordsProcessed: 100,
        recordsWithPII: 45,
        strategy: 'mask',
        confidence: {
          high: 25,
          medium: 7,
          low: 2,
        },
      };

      const result = PIIMetricsLogger.verifyNoPII(safeMetrics);

      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect PII in metrics', () => {
      const unsafeMetrics = {
        timestamp: new Date(),
        datasetId: 'ds-123',
        jobId: 'job-456',
        tenantId: 'tenant-abc',
        entitiesRemoved: {
          name: 5,
          ssn: 2,
          mrn: 3,
          phone: 4,
          email: 2,
          address: 1,
          dob: 3,
          date: 6,
          id: 8,
          other: 0,
        },
        totalEntitiesRemoved: 34,
        recordsProcessed: 100,
        recordsWithPII: 45,
        strategy: 'mask',
        confidence: {
          high: 25,
          medium: 7,
          low: 2,
        },
        // This field should NOT be here - contains actual value
        sampleValue: '123-45-6789',
      } as unknown as PIIMetrics;

      const result = PIIMetricsLogger.verifyNoPII(unsafeMetrics);

      expect(result.safe).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });
});
