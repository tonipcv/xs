/**
 * Complete Audit Trail Manager
 * Tracks all access and transformations in the data preparation pipeline
 * Provides comprehensive audit logging for compliance
 */

import { AuditLogger, AuditAction, AuditLogEntry } from '@/lib/preparation/audit/audit-logger';

export interface TransformationRecord {
  id: string;
  type: 'deduplication' | 'quality_filter' | 'deid' | 'chunking' | 'normalization' | 'tokenization';
  inputCount: number;
  outputCount: number;
  timestamp: Date;
  config: Record<string, unknown>;
  metrics: Record<string, number>;
}

export interface AccessRecord {
  id: string;
  userId: string;
  tenantId: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditTrailConfig {
  retentionDays: number;
  includeRawData: boolean;
  encryptLogs: boolean;
}

export class AuditTrailManager {
  private auditLogger: AuditLogger;
  private config: AuditTrailConfig;
  private transformations: Map<string, TransformationRecord[]>;
  private accessLog: AccessRecord[];

  constructor(auditLogger: AuditLogger, config?: Partial<AuditTrailConfig>) {
    this.auditLogger = auditLogger;
    this.config = {
      retentionDays: 365,
      includeRawData: false,
      encryptLogs: true,
      ...config,
    };
    this.transformations = new Map();
    this.accessLog = [];
  }

  /**
   * Log data transformation in the pipeline
   */
  async logTransformation(
    jobId: string,
    transformation: Omit<TransformationRecord, 'id' | 'timestamp'>
  ): Promise<string> {
    const record: TransformationRecord = {
      id: `transform-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...transformation,
      timestamp: new Date(),
    };

    // Store in memory map
    const existing = this.transformations.get(jobId) || [];
    existing.push(record);
    this.transformations.set(jobId, existing);

    // Log to audit system
    await this.auditLogger.log(
      'system',
      'default',
      'preparation.job.cancel',
      'transformation_applied',
      jobId,
      {
        purpose: 'audit',
        metadata: {
          transformationType: record.type,
          inputCount: record.inputCount,
          outputCount: record.outputCount,
          metrics: record.metrics,
          config: record.config,
        },
      }
    );

    return record.id;
  }

  /**
   * Log access to dataset or resource
   */
  async logAccess(record: Omit<AccessRecord, 'id' | 'timestamp'>): Promise<string> {
    const accessRecord: AccessRecord = {
      id: `access-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...record,
      timestamp: new Date(),
    };

    this.accessLog.push(accessRecord);

    await this.auditLogger.log(
      record.userId,
      record.tenantId,
      record.action,
      record.resource,
      record.resourceId,
      {
        purpose: record.purpose,
        metadata: {
          ipAddress: record.ipAddress,
          userAgent: record.userAgent,
          ...record.metadata,
        },
      }
    );

    return accessRecord.id;
  }

  /**
   * Get complete audit trail for a job
   */
  getJobAuditTrail(jobId: string): {
    transformations: TransformationRecord[];
    accessRecords: AccessRecord[];
    summary: {
      totalTransformations: number;
      totalAccesses: number;
      recordsReduced: number;
      piiRemoved: boolean;
    };
  } {
    const transformations = this.transformations.get(jobId) || [];
    const accessRecords = this.accessLog.filter(
      (a) => a.resourceId === jobId || a.metadata?.jobId === jobId
    );

    const recordsReduced = transformations.reduce(
      (sum, t) => sum + (t.inputCount - t.outputCount),
      0
    );

    const piiRemoved = transformations.some(
      (t) => t.type === 'deid' && t.outputCount > 0
    );

    return {
      transformations,
      accessRecords,
      summary: {
        totalTransformations: transformations.length,
        totalAccesses: accessRecords.length,
        recordsReduced,
        piiRemoved,
      },
    };
  }

  /**
   * Get access history for a user
   */
  getUserAccessHistory(userId: string, from?: Date, to?: Date): AccessRecord[] {
    return this.accessLog.filter((record) => {
      if (record.userId !== userId) return false;
      if (from && record.timestamp < from) return false;
      if (to && record.timestamp > to) return false;
      return true;
    });
  }

  /**
   * Get compliance report for audit
   */
  generateComplianceReport(tenantId: string, from: Date, to: Date): {
    tenantId: string;
    period: { from: Date; to: Date };
    totalAccesses: number;
    totalTransformations: number;
    uniqueUsers: number;
    piiOperations: number;
    deidOperations: number;
    rawDataAccessAttempts: number;
    blockedAttempts: number;
    complianceStatus: 'compliant' | 'review_needed' | 'violation_detected';
  } {
    const userAccesses = this.accessLog.filter(
      (a) => a.tenantId === tenantId && a.timestamp >= from && a.timestamp <= to
    );

    const allTransformations = Array.from(this.transformations.values()).flat();
    const tenantTransformations = allTransformations.filter(
      (t) => t.timestamp >= from && t.timestamp <= to
    );

    const uniqueUsers = new Set(userAccesses.map((a) => a.userId)).size;
    const piiOperations = tenantTransformations.filter(
      (t) => t.type === 'deid'
    ).length;
    const deidOperations = piiOperations;

    const rawDataAccessAttempts = userAccesses.filter(
      (a) => a.metadata?.rawDataDetected === true
    ).length;

    const blockedAttempts = userAccesses.filter(
      (a) => a.metadata?.blocked === true
    ).length;

    let complianceStatus: 'compliant' | 'review_needed' | 'violation_detected' = 'compliant';
    if (blockedAttempts > 0) complianceStatus = 'review_needed';
    if (rawDataAccessAttempts > blockedAttempts) complianceStatus = 'violation_detected';

    return {
      tenantId,
      period: { from, to },
      totalAccesses: userAccesses.length,
      totalTransformations: tenantTransformations.length,
      uniqueUsers,
      piiOperations,
      deidOperations,
      rawDataAccessAttempts,
      blockedAttempts,
      complianceStatus,
    };
  }

  /**
   * Export audit trail for external systems
   */
  async exportAuditTrail(
    format: 'json' | 'csv',
    from: Date,
    to: Date
  ): Promise<Buffer> {
    const relevantAccesses = this.accessLog.filter(
      (a) => a.timestamp >= from && a.timestamp <= to
    );

    if (format === 'json') {
      return Buffer.from(JSON.stringify(relevantAccesses, null, 2));
    }

    // CSV format
    const headers = 'id,timestamp,userId,action,resource,resourceId,purpose\n';
    const rows = relevantAccesses
      .map(
        (a) =>
          `${a.id},${a.timestamp.toISOString()},${a.userId},${a.action},${a.resource},${a.resourceId},${a.purpose || ''}`
      )
      .join('\n');

    return Buffer.from(headers + rows);
  }

  /**
   * Purge old audit records
   */
  async purgeOldRecords(before: Date): Promise<number> {
    const initialCount = this.accessLog.length;

    this.accessLog = this.accessLog.filter((a) => a.timestamp >= before);

    // Also purge transformations
    for (const [jobId, records] of this.transformations.entries()) {
      const filtered = records.filter((r) => r.timestamp >= before);
      if (filtered.length === 0) {
        this.transformations.delete(jobId);
      } else {
        this.transformations.set(jobId, filtered);
      }
    }

    const purgedCount =
      initialCount -
      this.accessLog.length +
      Array.from(this.transformations.values()).reduce(
        (sum, records) => sum + records.length,
        0
      );

    await this.auditLogger.log(
      'system',
      'default',
      'preparation.job.cancel',
      'audit_purged',
      'system',
      {
        purpose: 'maintenance',
        metadata: {
          purgedBefore: before.toISOString(),
          recordsRemoved: purgedCount,
          purgedAt: new Date().toISOString(),
        },
      }
    );

    return purgedCount;
  }

  /**
   * Get statistics for monitoring
   */
  getStatistics(): {
    totalAccessRecords: number;
    totalTransformations: number;
    uniqueJobs: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
  } {
    const allTransformations = Array.from(this.transformations.values()).flat();
    const timestamps = [
      ...this.accessLog.map((a) => a.timestamp),
      ...allTransformations.map((t) => t.timestamp),
    ].sort((a, b) => a.getTime() - b.getTime());

    return {
      totalAccessRecords: this.accessLog.length,
      totalTransformations: allTransformations.length,
      uniqueJobs: this.transformations.size,
      oldestRecord: timestamps[0] || null,
      newestRecord: timestamps[timestamps.length - 1] || null,
    };
  }
}
