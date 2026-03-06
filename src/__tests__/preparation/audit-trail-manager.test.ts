import { describe, it, expect, vi } from 'vitest';
import { AuditTrailManager } from '@/lib/preparation/audit/audit-trail-manager';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

describe('AuditTrailManager', () => {
  const createMockAuditLogger = (): AuditLogger =>
    ({ log: vi.fn().mockResolvedValue(undefined) }) as unknown as AuditLogger;

  const createManager = () => {
    return new AuditTrailManager(createMockAuditLogger());
  };

  describe('transformation logging', () => {
    it('should log transformation', async () => {
      const manager = createManager();
      const transformId = await manager.logTransformation('job-123', {
        type: 'deduplication',
        inputCount: 1000,
        outputCount: 950,
        config: { threshold: 0.9 },
        metrics: { duplicatesRemoved: 50 },
      });

      expect(transformId).toBeDefined();
      expect(transformId).toContain('transform-');
    });

    it('should store transformation in job trail', async () => {
      const manager = createManager();
      await manager.logTransformation('job-123', {
        type: 'deid',
        inputCount: 100,
        outputCount: 100,
        config: { strategy: 'mask' },
        metrics: { piiDetected: 10 },
      });

      const trail = manager.getJobAuditTrail('job-123');
      expect(trail.transformations).toHaveLength(1);
      expect(trail.transformations[0].type).toBe('deid');
    });

    it('should track multiple transformations for same job', async () => {
      const manager = createManager();
      await manager.logTransformation('job-123', {
        type: 'quality_filter',
        inputCount: 1000,
        outputCount: 900,
        config: { threshold: 0.8 },
        metrics: { filtered: 100 },
      });
      await manager.logTransformation('job-123', {
        type: 'deduplication',
        inputCount: 900,
        outputCount: 850,
        config: { method: 'hash' },
        metrics: { duplicates: 50 },
      });

      const trail = manager.getJobAuditTrail('job-123');
      expect(trail.transformations).toHaveLength(2);
      expect(trail.summary.totalTransformations).toBe(2);
    });
  });

  describe('access logging', () => {
    it('should log access', async () => {
      const manager = createManager();
      const accessId = await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
        purpose: 'research',
        ipAddress: '192.168.1.1',
      });

      expect(accessId).toBeDefined();
    });

    it('should retrieve user access history', async () => {
      const manager = createManager();
      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
      });

      const history = manager.getUserAccessHistory('user-1');
      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe('user-1');
    });

    it('should filter by date range', async () => {
      const manager = createManager();
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
      });

      const history = manager.getUserAccessHistory('user-1', yesterday, now);
      expect(history).toHaveLength(1);
    });
  });

  describe('job audit trail', () => {
    it('should provide complete job trail', async () => {
      const manager = createManager();
      await manager.logTransformation('job-123', {
        type: 'deduplication',
        inputCount: 1000,
        outputCount: 950,
        config: {},
        metrics: {},
      });
      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'job',
        resourceId: 'job-123',
        metadata: { jobId: 'job-123' },
      });

      const trail = manager.getJobAuditTrail('job-123');
      expect(trail.transformations).toHaveLength(1);
      expect(trail.accessRecords).toHaveLength(1);
      expect(trail.summary.totalTransformations).toBe(1);
      expect(trail.summary.totalAccesses).toBe(1);
    });

    it('should calculate records reduced', async () => {
      const manager = createManager();
      await manager.logTransformation('job-123', {
        type: 'quality_filter',
        inputCount: 1000,
        outputCount: 800,
        config: {},
        metrics: {},
      });
      await manager.logTransformation('job-123', {
        type: 'deduplication',
        inputCount: 800,
        outputCount: 750,
        config: {},
        metrics: {},
      });

      const trail = manager.getJobAuditTrail('job-123');
      expect(trail.summary.recordsReduced).toBe(250);
    });

    it('should detect PII operations', async () => {
      const manager = createManager();
      await manager.logTransformation('job-123', {
        type: 'deid',
        inputCount: 100,
        outputCount: 100,
        config: { piiFields: ['name', 'ssn'] },
        metrics: { piiRemoved: 10 },
      });

      const trail = manager.getJobAuditTrail('job-123');
      expect(trail.summary.piiRemoved).toBe(true);
    });
  });

  describe('compliance report', () => {
    it('should generate compliance report', () => {
      const manager = createManager();
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');

      const report = manager.generateComplianceReport('tenant-1', from, to);

      expect(report.tenantId).toBe('tenant-1');
      expect(report.period.from).toEqual(from);
      expect(report.period.to).toEqual(to);
    });

    it('should count PII operations', async () => {
      const manager = createManager();
      await manager.logTransformation('job-1', {
        type: 'deid',
        inputCount: 100,
        outputCount: 100,
        config: {},
        metrics: {},
      });

      const report = manager.generateComplianceReport(
        'default',
        new Date('2020-01-01'),
        new Date('2030-01-01')
      );

      expect(report.piiOperations).toBe(1);
      expect(report.deidOperations).toBe(1);
    });

    it('should detect violations', async () => {
      const manager = createManager();
      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
        metadata: { rawDataDetected: true, blocked: false },
      });

      const report = manager.generateComplianceReport(
        'tenant-1',
        new Date('2020-01-01'),
        new Date('2030-01-01')
      );

      expect(report.rawDataAccessAttempts).toBe(1);
      expect(report.complianceStatus).toBe('violation_detected');
    });

    it('should flag review needed when blocked attempts exist', async () => {
      const manager = createManager();
      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
        metadata: { rawDataDetected: true, blocked: true },
      });

      const report = manager.generateComplianceReport(
        'tenant-1',
        new Date('2020-01-01'),
        new Date('2030-01-01')
      );

      expect(report.blockedAttempts).toBe(1);
      expect(report.complianceStatus).toBe('review_needed');
    });
  });

  describe('export functionality', () => {
    it('should export as JSON', async () => {
      const manager = createManager();
      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
      });

      const exportData = await manager.exportAuditTrail(
        'json',
        new Date('2020-01-01'),
        new Date('2030-01-01')
      );

      const parsed = JSON.parse(exportData.toString());
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
    });

    it('should export as CSV', async () => {
      const manager = createManager();
      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
        purpose: 'research',
      });

      const exportData = await manager.exportAuditTrail(
        'csv',
        new Date('2020-01-01'),
        new Date('2030-01-01')
      );

      const csv = exportData.toString();
      expect(csv).toContain('id,timestamp,userId');
      expect(csv).toContain('user-1');
      expect(csv).toContain('research');
    });
  });

  describe('purge functionality', () => {
    it('should purge old records', async () => {
      const manager = createManager();
      const oldDate = new Date('2023-01-01');
      const cutoff = new Date('2024-01-01');

      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
      });

      // Manually set timestamp to old date
      const records = manager['accessLog'];
      records[0].timestamp = oldDate;

      const purged = await manager.purgeOldRecords(cutoff);
      expect(purged).toBeGreaterThanOrEqual(1);
    });
  });

  describe('statistics', () => {
    it('should provide statistics', async () => {
      const manager = createManager();
      await manager.logTransformation('job-1', {
        type: 'deduplication',
        inputCount: 100,
        outputCount: 90,
        config: {},
        metrics: {},
      });
      await manager.logAccess({
        userId: 'user-1',
        tenantId: 'tenant-1',
        action: 'preparation.data.access',
        resource: 'dataset',
        resourceId: 'ds-123',
      });

      const stats = manager.getStatistics();
      expect(stats.totalAccessRecords).toBe(1);
      expect(stats.totalTransformations).toBe(1);
      expect(stats.uniqueJobs).toBe(1);
      expect(stats.oldestRecord).toBeDefined();
      expect(stats.newestRecord).toBeDefined();
    });
  });
});
