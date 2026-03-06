/**
 * Telemetry and Billing System
 * Tracks compute costs, egress, and external service usage
 */

export interface TelemetryEvent {
  timestamp: Date;
  eventType: 'job_start' | 'job_complete' | 'egress' | 'external_api' | 'storage';
  datasetId: string;
  jobId?: string;
  metrics: Record<string, number>;
  cost?: number;
}

export interface JobMetrics {
  jobId: string;
  datasetId: string;
  startTime: Date;
  endTime?: Date;
  computeSeconds: number;
  bytesEgress: number;
  externalCosts: {
    embeddings?: number;
    stt?: number;
    ocr?: number;
  };
}

export interface BillingReport {
  period: { start: Date; end: Date };
  totalJobs: number;
  totalComputeSeconds: number;
  totalBytesEgress: number;
  externalCosts: {
    embeddings: number;
    stt: number;
    ocr: number;
  };
  estimatedCost: number;
  breakdownByDataset: Record<string, {
    jobs: number;
    computeSeconds: number;
    egressBytes: number;
    cost: number;
  }>;
}

export class TelemetryManager {
  private events: TelemetryEvent[] = [];
  private jobMetrics: Map<string, JobMetrics> = new Map();

  /**
   * Record job start event
   */
  recordJobStart(datasetId: string, jobId: string): void {
    this.events.push({
      timestamp: new Date(),
      eventType: 'job_start',
      datasetId,
      jobId,
      metrics: {},
    });

    this.jobMetrics.set(jobId, {
      jobId,
      datasetId,
      startTime: new Date(),
      computeSeconds: 0,
      bytesEgress: 0,
      externalCosts: {},
    });
  }

  /**
   * Record job completion
   */
  recordJobComplete(
    jobId: string,
    computeSeconds: number,
    success: boolean
  ): void {
    const metrics = this.jobMetrics.get(jobId);
    if (!metrics) return;

    metrics.endTime = new Date();
    metrics.computeSeconds = computeSeconds;

    this.events.push({
      timestamp: new Date(),
      eventType: 'job_complete',
      datasetId: metrics.datasetId,
      jobId,
      metrics: {
        computeSeconds,
        success: success ? 1 : 0,
      },
    });
  }

  /**
   * Record data egress
   */
  recordEgress(
    datasetId: string,
    jobId: string,
    bytes: number,
    destination: string
  ): void {
    const metrics = this.jobMetrics.get(jobId);
    if (metrics) {
      metrics.bytesEgress += bytes;
    }

    this.events.push({
      timestamp: new Date(),
      eventType: 'egress',
      datasetId,
      jobId,
      metrics: {
        bytes,
        cost: this.calculateEgressCost(bytes),
      },
    });
  }

  /**
   * Record external API usage (embeddings, STT, OCR)
   */
  recordExternalApi(
    datasetId: string,
    jobId: string,
    service: 'embeddings' | 'stt' | 'ocr',
    requests: number,
    tokens?: number
  ): void {
    const metrics = this.jobMetrics.get(jobId);
    const cost = this.calculateExternalCost(service, requests, tokens);

    if (metrics) {
      metrics.externalCosts[service] = (metrics.externalCosts[service] || 0) + cost;
    }

    this.events.push({
      timestamp: new Date(),
      eventType: 'external_api',
      datasetId,
      jobId,
      metrics: {
        requests,
        tokens: tokens || 0,
      },
      cost,
    });
  }

  /**
   * Record storage operation
   */
  recordStorage(
    datasetId: string,
    bytes: number,
    operation: 'read' | 'write' | 'delete'
  ): void {
    this.events.push({
      timestamp: new Date(),
      eventType: 'storage',
      datasetId,
      metrics: {
        bytes,
        operation: operation === 'read' ? 1 : operation === 'write' ? 2 : 3,
      },
    });
  }

  /**
   * Generate billing report for period
   */
  generateBillingReport(
    startDate: Date,
    endDate: Date
  ): BillingReport {
    const relevantEvents = this.events.filter(
      (e) => e.timestamp >= startDate && e.timestamp <= endDate
    );

    const jobEvents = relevantEvents.filter((e) => e.eventType === 'job_complete');
    const egressEvents = relevantEvents.filter((e) => e.eventType === 'egress');
    const externalEvents = relevantEvents.filter((e) => e.eventType === 'external_api');

    // Calculate totals
    const totalComputeSeconds = jobEvents.reduce(
      (sum, e) => sum + (e.metrics.computeSeconds || 0),
      0
    );

    const totalBytesEgress = egressEvents.reduce(
      (sum, e) => sum + (e.metrics.bytes || 0),
      0
    );

    const externalCosts = {
      embeddings: 0,
      stt: 0,
      ocr: 0,
    };

    for (const event of externalEvents) {
      const cost = event.cost || 0;
      // Infer service type from context or additional metadata
      if (event.jobId?.includes('embedding')) {
        externalCosts.embeddings += cost;
      } else if (event.jobId?.includes('stt')) {
        externalCosts.stt += cost;
      } else if (event.jobId?.includes('ocr')) {
        externalCosts.ocr += cost;
      }
    }

    // Breakdown by dataset
    const breakdownByDataset: BillingReport['breakdownByDataset'] = {};
    for (const event of jobEvents) {
      if (!breakdownByDataset[event.datasetId]) {
        breakdownByDataset[event.datasetId] = {
          jobs: 0,
          computeSeconds: 0,
          egressBytes: 0,
          cost: 0,
        };
      }
      breakdownByDataset[event.datasetId].jobs++;
      breakdownByDataset[event.datasetId].computeSeconds +=
        event.metrics.computeSeconds || 0;
    }

    for (const event of egressEvents) {
      if (breakdownByDataset[event.datasetId]) {
        breakdownByDataset[event.datasetId].egressBytes +=
          event.metrics.bytes || 0;
        breakdownByDataset[event.datasetId].cost +=
          event.metrics.cost || 0;
      }
    }

    // Calculate estimated total cost
    const computeCost = (totalComputeSeconds / 3600) * 0.50; // $0.50/hour
    const egressCost = this.calculateEgressCost(totalBytesEgress);
    const externalTotal =
      externalCosts.embeddings + externalCosts.stt + externalCosts.ocr;

    return {
      period: { start: startDate, end: endDate },
      totalJobs: jobEvents.length,
      totalComputeSeconds,
      totalBytesEgress,
      externalCosts,
      estimatedCost: computeCost + egressCost + externalTotal,
      breakdownByDataset,
    };
  }

  /**
   * Get real-time job metrics
   */
  getJobMetrics(jobId: string): JobMetrics | undefined {
    return this.jobMetrics.get(jobId);
  }

  /**
   * Export telemetry events
   */
  exportEvents(
    startDate?: Date,
    endDate?: Date
  ): TelemetryEvent[] {
    let events = this.events;

    if (startDate) {
      events = events.filter((e) => e.timestamp >= startDate);
    }
    if (endDate) {
      events = events.filter((e) => e.timestamp <= endDate);
    }

    return events;
  }

  /**
   * Calculate egress cost (simplified)
   */
  private calculateEgressCost(bytes: number): number {
    // AWS S3 standard egress pricing: $0.09/GB for first 10TB/month
    const gb = bytes / (1024 * 1024 * 1024);
    return gb * 0.09;
  }

  /**
   * Calculate external API cost
   */
  private calculateExternalCost(
    service: 'embeddings' | 'stt' | 'ocr',
    requests: number,
    tokens?: number
  ): number {
    switch (service) {
      case 'embeddings':
        // ~$0.0001 per 1K tokens (OpenAI)
        return ((tokens || 0) / 1000) * 0.0001;
      case 'stt':
        // ~$0.006 per minute (Whisper)
        return requests * 0.006;
      case 'ocr':
        // ~$0.0015 per request (Tesseract/AWS Textract)
        return requests * 0.0015;
      default:
        return 0;
    }
  }

  /**
   * Clear old events
   */
  purgeEvents(olderThan: Date): number {
    const beforeCount = this.events.length;
    this.events = this.events.filter((e) => e.timestamp > olderThan);
    return beforeCount - this.events.length;
  }
}
