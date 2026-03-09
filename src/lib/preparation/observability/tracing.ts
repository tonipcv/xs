/**
 * Simplified Tracing for Data Preparation Pipeline
 * With OpenTelemetry integration
 */

import { trace, SpanStatusCode, Attributes } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

let otelProvider: NodeTracerProvider | null = null;
let otelInitialized = false;

export interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  collectorUrl?: string;
  environment: 'development' | 'staging' | 'production';
  enabled: boolean;
  useOpenTelemetry?: boolean;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error';
  errorMessage?: string;
  attributes: Record<string, string | number | boolean>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, string | number | boolean>;
  }>;
}

export class PreparationTracer {
  private config: TracingConfig;
  private spans: Span[] = [];
  private activeSpans: Map<string, Span> = new Map();
  private traceId: string;

  constructor(config: TracingConfig) {
    this.config = config;
    this.traceId = `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startJobSpan(jobId: string, tenantId: string, operation: string, attributes?: Record<string, string | number | boolean>): Span | null {
    if (!this.config.enabled) return null;
    const span: Span = {
      id: `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`,
      traceId: this.traceId,
      name: `preparation.${operation}`,
      startTime: Date.now(),
      status: 'ok',
      attributes: { 'job.id': jobId, 'job.tenant_id': tenantId, 'job.operation': operation, ...attributes },
      events: [],
    };
    this.activeSpans.set(jobId, span);
    this.spans.push(span);
    return span;
  }

  startStageSpan(jobId: string, stage: string, parentSpan: Span, attributes?: Record<string, string | number | boolean>): Span | null {
    if (!this.config.enabled) return null;
    const span: Span = {
      id: `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`,
      traceId: parentSpan.traceId,
      parentId: parentSpan.id,
      name: `preparation.stage.${stage}`,
      startTime: Date.now(),
      status: 'ok',
      attributes: { 'job.id': jobId, 'stage.name': stage, ...attributes },
      events: [],
    };
    this.spans.push(span);
    return span;
  }

  endSpan(span: Span | null, success: boolean = true, error?: Error): void {
    if (!span || !this.config.enabled) return;
    span.endTime = Date.now();
    span.status = success ? 'ok' : 'error';
    if (!success && error) span.errorMessage = error.message;
    for (const [jobId, activeSpan] of this.activeSpans.entries()) {
      if (activeSpan.id === span.id) { this.activeSpans.delete(jobId); break; }
    }
  }

  recordEvent(span: Span | null, eventName: string, attributes?: Record<string, string | number | boolean>): void {
    if (!span || !this.config.enabled) return;
    span.events.push({ name: eventName, timestamp: Date.now(), attributes });
  }

  recordMetrics(span: Span | null, metrics: Record<string, number>): void {
    if (!span || !this.config.enabled) return;
    for (const [key, value] of Object.entries(metrics)) {
      span.attributes[`metric.${key}`] = value;
    }
  }

  getTraceContext(span: Span | null): SpanContext | null {
    if (!span) return null;
    return { traceId: span.traceId, spanId: span.id, parentSpanId: span.parentId };
  }

  injectContext(headers: Record<string, string> = {}): Record<string, string> {
    const activeSpan = Array.from(this.activeSpans.values())[0];
    if (activeSpan) {
      headers['x-trace-id'] = activeSpan.traceId;
      headers['x-span-id'] = activeSpan.id;
    }
    return headers;
  }

  getSpans(): Span[] { return [...this.spans]; }
  getActiveSpans(): Span[] { return Array.from(this.activeSpans.values()); }
  clear(): void { this.spans = []; this.activeSpans.clear(); }
  isEnabled(): boolean { return this.config.enabled; }
}

export function createTracerFromEnv(): PreparationTracer {
  return new PreparationTracer({
    serviceName: process.env.OTEL_SERVICE_NAME || 'xase-preparation',
    serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
    collectorUrl: process.env.OTEL_COLLECTOR_URL,
    environment: (process.env.NODE_ENV as any) || 'development',
    enabled: process.env.TRACING_ENABLED !== 'false',
  });
}

let globalTracer: PreparationTracer | null = null;
export function getGlobalTracer(): PreparationTracer {
  if (!globalTracer) globalTracer = createTracerFromEnv();
  return globalTracer;
}
export function setGlobalTracer(tracer: PreparationTracer): void { globalTracer = tracer; }

// OpenTelemetry initialization
export function initOpenTelemetry(config?: Partial<TracingConfig>): void {
  if (otelInitialized) return;

  const serviceName = config?.serviceName || process.env.OTEL_SERVICE_NAME || 'xase-preparation';
  const serviceVersion = config?.serviceVersion || process.env.OTEL_SERVICE_VERSION || '1.0.0';

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
  });

  otelProvider = new NodeTracerProvider({ resource });

  // Configure OTLP exporter if endpoint is set
  const otlpEndpoint = config?.collectorUrl || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (otlpEndpoint) {
    const exporter = new OTLPTraceExporter({ url: otlpEndpoint });
    otelProvider.addSpanProcessor(new BatchSpanProcessor(exporter));
  }

  otelProvider.register();
  otelInitialized = true;
  console.log(`[Tracing] OpenTelemetry initialized for ${serviceName}`);
}

export function shutdownOpenTelemetry(): Promise<void> {
  if (!otelProvider) return Promise.resolve();
  return otelProvider.shutdown();
}

// OpenTelemetry wrapper functions
export async function withOtelSpan<T>(
  name: string,
  fn: (span: any) => Promise<T>,
  attributes?: Attributes
): Promise<T> {
  if (!otelInitialized) {
    return fn({ setAttribute: () => {}, setStatus: () => {}, end: () => {} });
  }

  const tracer = trace.getTracer('xase-preparation');
  return tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          if (value !== undefined) span.setAttribute(key, value);
        });
      }
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

// Pipeline stage attribute keys
export const AttributeKeys = {
  JOB_ID: 'preparation.job_id',
  DATASET_ID: 'preparation.dataset_id',
  TENANT_ID: 'preparation.tenant_id',
  TASK_TYPE: 'preparation.task_type',
  MODALITY: 'preparation.modality',
  FORMAT: 'preparation.format',
  RUNTIME: 'preparation.runtime',
  STAGE: 'preparation.stage',
  RECORDS_PROCESSED: 'preparation.records_processed',
  RECORDS_FILTERED: 'preparation.records_filtered',
  BYTES_PROCESSED: 'preparation.bytes_processed',
  DURATION_MS: 'preparation.duration_ms',
  ERROR_TYPE: 'preparation.error_type',
  ERROR_MESSAGE: 'preparation.error_message',
} as const;

// Pipeline stages
export const PipelineStages = {
  API_REQUEST: 'preparation.api.request',
  NORMALIZATION: 'preparation.normalization',
  DEID: 'preparation.deid',
  QUALITY_GATE: 'preparation.quality_gate',
  COMPILATION: 'preparation.compilation',
  COMPRESSION: 'preparation.compression',
  PACKAGING: 'preparation.packaging',
  DELIVERY: 'preparation.delivery',
  CLEANUP: 'preparation.cleanup',
} as const;
