/**
 * PII Metrics Logger
 * Logs de-identification metrics without leaking PII content
 * HIPAA-compliant logging - only counts and types, no actual values
 */

import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

export interface PIIMetrics {
  timestamp: Date;
  datasetId: string;
  jobId: string;
  tenantId: string;
  // Aggregate counts only - NO actual PII values
  entitiesRemoved: {
    name: number;
    ssn: number;
    mrn: number;
    phone: number;
    email: number;
    address: number;
    dob: number;
    date: number;
    id: number;
    other: number;
  };
  totalEntitiesRemoved: number;
  recordsProcessed: number;
  recordsWithPII: number;
  strategy: string;
  confidence: {
    high: number; // >0.9
    medium: number; // 0.7-0.9
    low: number; // <0.7
  };
}

export interface MetricsReport {
  period: { start: Date; end: Date };
  totalDatasets: number;
  totalRecordsProcessed: number;
  totalPIIRemoved: number;
  breakdownByType: Record<string, number>;
  averageConfidence: number;
}

export class PIIMetricsLogger {
  private auditLogger: AuditLogger;
  private metrics: PIIMetrics[] = [];

  constructor(auditLogger: AuditLogger) {
    this.auditLogger = auditLogger;
  }

  /**
   * Log PII removal metrics WITHOUT leaking content
   * Only counts and confidence scores - never actual values
   */
  async logMetrics(metrics: Omit<PIIMetrics, 'timestamp'>): Promise<void> {
    const fullMetrics: PIIMetrics = {
      ...metrics,
      timestamp: new Date(),
    };

    this.metrics.push(fullMetrics);

    // Log to audit system (structured, no PII content)
    await this.auditLogger.log(
      'system',
      metrics.tenantId,
      'preparation.data.access',
      'pii_deidentification',
      metrics.datasetId,
      {
        purpose: 'deidentification',
        metadata: {
          jobId: metrics.jobId,
          // Only counts - NO actual PII values
          entitiesRemoved: metrics.entitiesRemoved,
          totalEntitiesRemoved: metrics.totalEntitiesRemoved,
          recordsProcessed: metrics.recordsProcessed,
          recordsWithPII: metrics.recordsWithPII,
          strategy: metrics.strategy,
          confidenceHigh: metrics.confidence.high,
          confidenceMedium: metrics.confidence.medium,
          confidenceLow: metrics.confidence.low,
        },
      }
    );
  }

  /**
   * Log batch de-identification results
   */
  async logBatchMetrics(
    datasetId: string,
    jobId: string,
    tenantId: string,
    results: Array<{
      entitiesDetected: number;
      entityTypes: string[];
      confidence: number;
    }>,
    strategy: string
  ): Promise<void> {
    // Aggregate counts by type
    const entitiesRemoved = {
      name: 0,
      ssn: 0,
      mrn: 0,
      phone: 0,
      email: 0,
      address: 0,
      dob: 0,
      date: 0,
      id: 0,
      other: 0,
    };

    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;
    let recordsWithPII = 0;

    for (const result of results) {
      if (result.entitiesDetected > 0) {
        recordsWithPII++;
      }

      // Count by confidence level
      if (result.confidence > 0.9) {
        highConfidence += result.entitiesDetected;
      } else if (result.confidence > 0.7) {
        mediumConfidence += result.entitiesDetected;
      } else {
        lowConfidence += result.entitiesDetected;
      }

      // Count by entity type (no actual values)
      for (const type of result.entityTypes) {
        if (type in entitiesRemoved) {
          entitiesRemoved[type as keyof typeof entitiesRemoved]++;
        } else {
          entitiesRemoved.other++;
        }
      }
    }

    await this.logMetrics({
      datasetId,
      jobId,
      tenantId,
      entitiesRemoved,
      totalEntitiesRemoved: results.reduce((sum, r) => sum + r.entitiesDetected, 0),
      recordsProcessed: results.length,
      recordsWithPII,
      strategy,
      confidence: {
        high: highConfidence,
        medium: mediumConfidence,
        low: lowConfidence,
      },
    });
  }

  /**
   * Generate metrics report for period
   * Aggregated stats only - no individual records
   */
  generateReport(startDate: Date, endDate: Date): MetricsReport {
    const periodMetrics = this.metrics.filter(
      (m) => m.timestamp >= startDate && m.timestamp <= endDate
    );

    const datasets = new Set(periodMetrics.map((m) => m.datasetId));
    
    const totalRecords = periodMetrics.reduce(
      (sum, m) => sum + m.recordsProcessed,
      0
    );

    const totalPII = periodMetrics.reduce(
      (sum, m) => sum + m.totalEntitiesRemoved,
      0
    );

    // Aggregate breakdown by type
    const breakdownByType: Record<string, number> = {};
    for (const metric of periodMetrics) {
      for (const [type, count] of Object.entries(metric.entitiesRemoved)) {
        breakdownByType[type] = (breakdownByType[type] || 0) + count;
      }
    }

    // Calculate average confidence
    const totalConfident = periodMetrics.reduce(
      (sum, m) => sum + m.confidence.high + m.confidence.medium + m.confidence.low,
      0
    );
    const weightedConfidence = periodMetrics.reduce((sum, m) => {
      return sum + (
        m.confidence.high * 0.95 +
        m.confidence.medium * 0.8 +
        m.confidence.low * 0.5
      );
    }, 0);

    return {
      period: { start: startDate, end: endDate },
      totalDatasets: datasets.size,
      totalRecordsProcessed: totalRecords,
      totalPIIRemoved: totalPII,
      breakdownByType,
      averageConfidence: totalConfident > 0 ? weightedConfidence / totalConfident : 0,
    };
  }

  /**
   * Get real-time stats (for dashboards)
   * No PII content, only aggregates
   */
  getRealtimeStats(): {
    totalDatasetsToday: number;
    totalRecordsToday: number;
    totalPIIRemovedToday: number;
    topEntityType: string;
  } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMetrics = this.metrics.filter((m) => m.timestamp >= today);
    const datasets = new Set(todayMetrics.map((m) => m.datasetId));

    const totalPII = todayMetrics.reduce(
      (sum, m) => sum + m.totalEntitiesRemoved,
      0
    );

    // Find top entity type
    const typeCounts: Record<string, number> = {};
    for (const metric of todayMetrics) {
      for (const [type, count] of Object.entries(metric.entitiesRemoved)) {
        typeCounts[type] = (typeCounts[type] || 0) + count;
      }
    }

    const topEntityType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    return {
      totalDatasetsToday: datasets.size,
      totalRecordsToday: todayMetrics.reduce(
        (sum, m) => sum + m.recordsProcessed,
        0
      ),
      totalPIIRemovedToday: totalPII,
      topEntityType,
    };
  }

  /**
   * Export metrics (aggregated, no PII)
   */
  exportMetrics(
    startDate?: Date,
    endDate?: Date
  ): Array<Omit<PIIMetrics, 'timestamp'> & { timestamp: string }> {
    let filtered = this.metrics;

    if (startDate) {
      filtered = filtered.filter((m) => m.timestamp >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((m) => m.timestamp <= endDate);
    }

    return filtered.map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    }));
  }

  /**
   * Purge old metrics (retention policy)
   */
  purgeMetrics(olderThan: Date): number {
    const beforeCount = this.metrics.length;
    this.metrics = this.metrics.filter((m) => m.timestamp > olderThan);
    return beforeCount - this.metrics.length;
  }

  /**
   * Verify no PII in metrics (safety check)
   */
  static verifyNoPII(metrics: PIIMetrics): { safe: boolean; violations: string[] } {
    const violations: string[] = [];

    // Check that entity values are not present
    const stringified = JSON.stringify(metrics);
    
    // Pattern that would indicate actual values (not counts)
    const dangerousPatterns = [
      /"value":\s*"[^"]+"/, // value fields with content
      /"text":\s*"[^"]+"/,  // text fields with content
      /\d{3}-\d{2}-\d{4}/,   // SSN pattern
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(stringified)) {
        violations.push(`Potential PII detected: ${pattern.source}`);
      }
    }

    return {
      safe: violations.length === 0,
      violations,
    };
  }
}
