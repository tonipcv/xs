/**
 * Sidecar Segment Endpoint API
 * Provides streaming access to prepared dataset segments with pagination
 * GET /api/v1/datasets/:id/segments?jobId=...&cursor=...
 */

import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

export interface SegmentRequest {
  datasetId: string;
  jobId: string;
  cursor?: string;
  limit?: number;
  modality?: 'text' | 'image' | 'audio' | 'note';
}

export interface Segment {
  id: string;
  type: 'text' | 'image' | 'audio' | 'note';
  data: Record<string, unknown>;
  metadata: {
    offset: number;
    totalSegments: number;
    checksum: string;
  };
}

export interface SegmentResponse {
  segments: Segment[];
  nextCursor?: string;
  hasMore: boolean;
  progress: {
    processed: number;
    total: number;
    percentage: number;
  };
}

export interface StreamingConfig {
  chunkSize: number;
  backpressureEnabled: boolean;
  maxConcurrentStreams: number;
}

export class SidecarSegmentEndpoint {
  private auditLogger: AuditLogger;
  private activeStreams: Map<string, {
    startTime: Date;
    segmentsDelivered: number;
    bytesDelivered: number;
  }> = new Map();

  constructor(auditLogger: AuditLogger) {
    this.auditLogger = auditLogger;
  }

  /**
   * GET /api/v1/datasets/:id/segments
   * Main endpoint for fetching prepared segments
   */
  async getSegments(request: SegmentRequest): Promise<SegmentResponse> {
    const startTime = Date.now();
    
    try {
      // Validate request
      if (!request.datasetId || !request.jobId) {
        throw new Error('datasetId and jobId are required');
      }

      // Parse cursor (base64 encoded offset)
      const offset = request.cursor ? this.decodeCursor(request.cursor) : 0;
      const limit = Math.min(request.limit ?? 100, 1000); // Max 1000 per request

      // Fetch segments from storage
      const segments = await this.fetchSegments(
        request.datasetId,
        request.jobId,
        offset,
        limit,
        request.modality
      );

      // Calculate progress
      const totalSegments = await this.getTotalSegments(
        request.datasetId,
        request.jobId,
        request.modality
      );
      const processed = offset + segments.length;
      const percentage = Math.round((processed / totalSegments) * 100);

      // Determine if more segments exist
      const hasMore = processed < totalSegments;
      const nextCursor = hasMore ? this.encodeCursor(processed) : undefined;

      // Track streaming metrics
      this.trackStream(request.jobId, segments.length);

      // Audit access
      await this.auditAccess(request, segments.length, startTime);

      return {
        segments,
        nextCursor,
        hasMore,
        progress: {
          processed,
          total: totalSegments,
          percentage,
        },
      };
    } catch (error) {
      await this.auditError(request, error, startTime);
      throw error;
    }
  }

  /**
   * Stream segments with backpressure control
   */
  async *streamSegments(
    request: SegmentRequest,
    config: StreamingConfig = {
      chunkSize: 100,
      backpressureEnabled: true,
      maxConcurrentStreams: 10,
    }
  ): AsyncGenerator<Segment[], void, unknown> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getSegments({
        ...request,
        cursor,
        limit: config.chunkSize,
      });

      yield response.segments;

      hasMore = response.hasMore;
      cursor = response.nextCursor;

      // Check backpressure
      if (config.backpressureEnabled && this.isBackpressureHigh(request.jobId)) {
        await this.waitForBackpressureRelease(request.jobId, 1000);
      }
    }
  }

  /**
   * Fetch segments from storage (simulated)
   */
  private async fetchSegments(
    datasetId: string,
    jobId: string,
    offset: number,
    limit: number,
    modality?: string
  ): Promise<Segment[]> {
    // In production, fetch from S3 or database
    // For now, return simulated segments
    const segments: Segment[] = [];
    
    for (let i = 0; i < limit; i++) {
      const segmentOffset = offset + i;
      segments.push({
        id: `seg_${datasetId}_${jobId}_${segmentOffset}`,
        type: (modality as Segment['type']) || 'text',
        data: {
          content: `Segment ${segmentOffset} content`,
          index: segmentOffset,
        },
        metadata: {
          offset: segmentOffset,
          totalSegments: offset + limit + 100, // Simulated total
          checksum: `hash_${segmentOffset}`,
        },
      });
    }

    return segments;
  }

  /**
   * Get total segment count
   */
  private async getTotalSegments(
    datasetId: string,
    jobId: string,
    modality?: string
  ): Promise<number> {
    // In production, query metadata store
    return 1000; // Simulated
  }

  /**
   * Encode offset to cursor (base64)
   */
  private encodeCursor(offset: number): string {
    return Buffer.from(offset.toString()).toString('base64');
  }

  /**
   * Decode cursor to offset
   */
  private decodeCursor(cursor: string): number {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('ascii');
      return parseInt(decoded, 10);
    } catch {
      return 0;
    }
  }

  /**
   * Track streaming metrics
   */
  private trackStream(jobId: string, segmentsCount: number): void {
    const existing = this.activeStreams.get(jobId);
    if (existing) {
      existing.segmentsDelivered += segmentsCount;
    } else {
      this.activeStreams.set(jobId, {
        startTime: new Date(),
        segmentsDelivered: segmentsCount,
        bytesDelivered: 0,
      });
    }
  }

  /**
   * Check if backpressure is high for a stream
   */
  private isBackpressureHigh(jobId: string): boolean {
    const stream = this.activeStreams.get(jobId);
    if (!stream) return false;
    
    // Check if stream is delivering too fast (>1000 segments/sec)
    const elapsed = Date.now() - stream.startTime.getTime();
    const rate = stream.segmentsDelivered / (elapsed / 1000);
    return rate > 1000;
  }

  /**
   * Wait for backpressure to release
   */
  private async waitForBackpressureRelease(jobId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Reset stream tracking
        const stream = this.activeStreams.get(jobId);
        if (stream) {
          stream.startTime = new Date();
          stream.segmentsDelivered = 0;
        }
        resolve();
      }, timeoutMs);
    });
  }

  /**
   * Audit segment access
   */
  private async auditAccess(
    request: SegmentRequest,
    segmentsCount: number,
    startTime: number
  ): Promise<void> {
    await this.auditLogger.log(
      'system',
      'default',
      'preparation.data.access',
      'segments_fetched',
      request.datasetId,
      {
        purpose: 'sidecar_delivery',
        metadata: {
          jobId: request.jobId,
          cursor: request.cursor,
          limit: request.limit,
          modality: request.modality,
          segmentsReturned: segmentsCount,
          duration: Date.now() - startTime,
        },
      }
    );
  }

  /**
   * Audit errors
   */
  private async auditError(
    request: SegmentRequest,
    error: unknown,
    startTime: number
  ): Promise<void> {
    await this.auditLogger.log(
      'system',
      'default',
      'preparation.data.access',
      'segments_error',
      request.datasetId,
      {
        purpose: 'sidecar_delivery',
        metadata: {
          jobId: request.jobId,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        },
      }
    );
  }

  /**
   * Get stream statistics
   */
  getStreamStats(jobId: string): {
    active: boolean;
    segmentsDelivered: number;
    durationMs: number;
  } {
    const stream = this.activeStreams.get(jobId);
    if (!stream) {
      return { active: false, segmentsDelivered: 0, durationMs: 0 };
    }

    return {
      active: true,
      segmentsDelivered: stream.segmentsDelivered,
      durationMs: Date.now() - stream.startTime.getTime(),
    };
  }

  /**
   * Close stream and cleanup
   */
  closeStream(jobId: string): void {
    this.activeStreams.delete(jobId);
  }
}
