import { describe, it, expect, vi } from 'vitest';
import { SidecarSegmentEndpoint, SegmentRequest, StreamingConfig } from '@/lib/preparation/api/sidecar-segments';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

describe('SidecarSegmentEndpoint', () => {
  const createMockAuditLogger = () => ({
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogger);

  const createEndpoint = () => new SidecarSegmentEndpoint(createMockAuditLogger());

  describe('getSegments', () => {
    it('should fetch segments with pagination', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        limit: 10,
      };

      const response = await endpoint.getSegments(request);

      expect(response.segments).toHaveLength(10);
      expect(response.hasMore).toBe(true);
      expect(response.progress.percentage).toBeGreaterThan(0);
    });

    it('should return next cursor for pagination', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        limit: 10,
      };

      const response = await endpoint.getSegments(request);

      expect(response.nextCursor).toBeDefined();
    });

    it('should decode cursor to offset', async () => {
      const endpoint = createEndpoint();
      const cursor = Buffer.from('50').toString('base64');
      
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        cursor,
        limit: 10,
      };

      const response = await endpoint.getSegments(request);

      expect(response.segments[0].metadata.offset).toBe(50);
    });

    it('should filter by modality', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        modality: 'image',
        limit: 5,
      };

      const response = await endpoint.getSegments(request);

      expect(response.segments[0].type).toBe('image');
    });

    it('should track progress correctly', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        limit: 100,
      };

      const response = await endpoint.getSegments(request);

      expect(response.progress.processed).toBe(100);
      expect(response.progress.total).toBe(1000); // Simulated total
      expect(response.progress.percentage).toBe(10);
    });

    it('should throw error for missing datasetId', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: '',
        jobId: 'job-456',
      };

      await expect(endpoint.getSegments(request)).rejects.toThrow('datasetId and jobId are required');
    });

    it('should audit access', async () => {
      const auditLogger = createMockAuditLogger();
      const endpoint = new SidecarSegmentEndpoint(auditLogger);
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        limit: 10,
      };

      await endpoint.getSegments(request);

      expect(auditLogger.log).toHaveBeenCalledWith(
        'system',
        'default',
        'preparation.data.access',
        'segments_fetched',
        'ds-123',
        expect.objectContaining({
          purpose: 'sidecar_delivery',
          metadata: expect.objectContaining({
            jobId: 'job-456',
            limit: 10,
          }),
        })
      );
    });
  });

  describe('streaming', () => {
    it('should stream segments in chunks', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
      };
      const config: StreamingConfig = {
        chunkSize: 50,
        backpressureEnabled: false,
        maxConcurrentStreams: 10,
      };

      const chunks: unknown[][] = [];
      for await (const chunk of endpoint.streamSegments(request, config)) {
        chunks.push(chunk);
        if (chunks.length >= 2) break; // Just test first 2 chunks
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveLength(50);
    });

    it('should handle backpressure', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-789',
      };
      const config: StreamingConfig = {
        chunkSize: 10,
        backpressureEnabled: true,
        maxConcurrentStreams: 10,
      };

      // Simulate high-rate streaming
      endpoint['activeStreams'].set('job-789', {
        startTime: new Date(Date.now() - 100), // Started 100ms ago
        segmentsDelivered: 2000, // 2000 segments in 100ms = 20k/sec
        bytesDelivered: 0,
      });

      const startTime = Date.now();
      const chunks: unknown[][] = [];
      
      for await (const chunk of endpoint.streamSegments(request, config)) {
        chunks.push(chunk);
        if (chunks.length >= 1) break;
      }

      // Should have waited due to backpressure
      expect(Date.now() - startTime).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('stream stats', () => {
    it('should return stream statistics', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        limit: 10,
      };

      await endpoint.getSegments(request);

      const stats = endpoint.getStreamStats('job-456');

      expect(stats.active).toBe(true);
      expect(stats.segmentsDelivered).toBe(10);
      expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return inactive for unknown stream', () => {
      const endpoint = createEndpoint();

      const stats = endpoint.getStreamStats('unknown-job');

      expect(stats.active).toBe(false);
    });
  });

  describe('stream management', () => {
    it('should close stream', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        limit: 10,
      };

      await endpoint.getSegments(request);
      expect(endpoint.getStreamStats('job-456').active).toBe(true);

      endpoint.closeStream('job-456');

      expect(endpoint.getStreamStats('job-456').active).toBe(false);
    });
  });

  describe('cursor encoding', () => {
    it('should encode cursor correctly', async () => {
      const endpoint = createEndpoint();
      const request: SegmentRequest = {
        datasetId: 'ds-123',
        jobId: 'job-456',
        limit: 100,
      };

      const response = await endpoint.getSegments(request);

      // Cursor should be base64 encoded
      expect(response.nextCursor).toMatch(/^[A-Za-z0-9+/=]+$/);
      
      // Next page should use cursor
      if (response.nextCursor) {
        const nextResponse = await endpoint.getSegments({
          ...request,
          cursor: response.nextCursor,
        });
        
        expect(nextResponse.segments[0].metadata.offset).toBe(100);
      }
    });
  });
});
