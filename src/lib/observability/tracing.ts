/**
 * Distributed Tracing with OpenTelemetry
 * Complete observability for distributed systems
 */

import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const SERVICE_NAME = 'xase-sheets';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';

let tracerProvider: NodeTracerProvider | null = null;

/**
 * Initialize OpenTelemetry tracing
 */
export function initializeTracing(): void {
  if (tracerProvider) {
    return; // Already initialized
  }

  // Create resource with service information
  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
      [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    })
  );

  // Create tracer provider
  tracerProvider = new NodeTracerProvider({
    resource,
  });

  // Configure OTLP exporter
  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    headers: {
      'x-api-key': process.env.OTEL_API_KEY || '',
    },
  });

  // Add batch span processor
  tracerProvider.addSpanProcessor(new BatchSpanProcessor(exporter));

  // Register the provider
  tracerProvider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  // Register instrumentations
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingPaths: ['/health', '/metrics'],
      }),
      new ExpressInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  console.log('OpenTelemetry tracing initialized');
}

/**
 * Get tracer instance
 */
export function getTracer() {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

/**
 * Create a new span
 */
export function createSpan(name: string, attributes?: Record<string, any>): Span {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    attributes,
  });
  return span;
}

/**
 * Execute function with tracing
 */
export async function withTracing<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const tracer = getTracer();
  
  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add event to current span
 */
export function addEvent(name: string, attributes?: Record<string, any>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set attribute on current span
 */
export function setAttribute(key: string, value: any): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Set multiple attributes on current span
 */
export function setAttributes(attributes: Record<string, any>): void {
  const span = trace.getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

/**
 * Record exception in current span
 */
export function recordException(error: Error): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

/**
 * Get current trace context
 */
export function getTraceContext(): any {
  return context.active();
}

/**
 * Trace database query
 */
export async function traceQuery<T>(
  query: string,
  fn: () => Promise<T>
): Promise<T> {
  return withTracing(
    'db.query',
    async (span) => {
      span.setAttribute('db.statement', query);
      span.setAttribute('db.system', 'postgresql');
      return await fn();
    }
  );
}

/**
 * Trace HTTP request
 */
export async function traceHttpRequest<T>(
  method: string,
  url: string,
  fn: () => Promise<T>
): Promise<T> {
  return withTracing(
    'http.request',
    async (span) => {
      span.setAttribute('http.method', method);
      span.setAttribute('http.url', url);
      
      const result = await fn();
      
      span.setAttribute('http.status_code', 200);
      return result;
    }
  );
}

/**
 * Trace cache operation
 */
export async function traceCacheOperation<T>(
  operation: 'get' | 'set' | 'delete',
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  return withTracing(
    `cache.${operation}`,
    async (span) => {
      span.setAttribute('cache.key', key);
      span.setAttribute('cache.operation', operation);
      return await fn();
    }
  );
}

/**
 * Trace S3 operation
 */
export async function traceS3Operation<T>(
  operation: string,
  bucket: string,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  return withTracing(
    `s3.${operation}`,
    async (span) => {
      span.setAttribute('aws.s3.bucket', bucket);
      span.setAttribute('aws.s3.key', key);
      span.setAttribute('aws.s3.operation', operation);
      return await fn();
    }
  );
}

/**
 * Trace external API call
 */
export async function traceExternalApi<T>(
  service: string,
  endpoint: string,
  fn: () => Promise<T>
): Promise<T> {
  return withTracing(
    `external.${service}`,
    async (span) => {
      span.setAttribute('external.service', service);
      span.setAttribute('external.endpoint', endpoint);
      return await fn();
    }
  );
}

/**
 * Trace business operation
 */
export async function traceBusinessOperation<T>(
  operation: string,
  metadata: Record<string, any>,
  fn: () => Promise<T>
): Promise<T> {
  return withTracing(
    `business.${operation}`,
    async (span) => {
      setAttributes(metadata);
      return await fn();
    }
  );
}

/**
 * Shutdown tracing
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
    console.log('OpenTelemetry tracing shutdown');
  }
}

/**
 * Middleware for Next.js API routes
 */
export function withTracingMiddleware(handler: any) {
  return async (req: any, res: any) => {
    const tracer = getTracer();
    
    return tracer.startActiveSpan(
      `${req.method} ${req.url}`,
      {
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.target': req.url,
          'http.user_agent': req.headers['user-agent'],
        },
      },
      async (span) => {
        try {
          const result = await handler(req, res);
          span.setAttribute('http.status_code', res.statusCode);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error: any) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  };
}

/**
 * Get trace ID from current context
 */
export function getTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (span) {
    return span.spanContext().traceId;
  }
  return undefined;
}

/**
 * Get span ID from current context
 */
export function getSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  if (span) {
    return span.spanContext().spanId;
  }
  return undefined;
}

/**
 * Create custom metric
 */
export function recordMetric(name: string, value: number, attributes?: Record<string, any>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, {
      value,
      ...attributes,
    });
  }
}

// Initialize tracing on module load
if (process.env.OTEL_ENABLED === 'true') {
  initializeTracing();
}
