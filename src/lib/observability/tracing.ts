/**
 * Distributed Tracing stub (OpenTelemetry removed)
 * Provides no-op tracer helpers to satisfy imports without external deps.
 */

type SpanStatusCode = 'OK' | 'ERROR'

interface Span {
  setStatus(_status: { code: SpanStatusCode; message?: string }): void
  recordException(_error: any): void
  setAttribute(_key: string, _value: any): void
  addEvent(_name: string, _attributes?: Record<string, any>): void
  end(): void
}

class NoopSpan implements Span {
  setStatus(_status: { code: SpanStatusCode; message?: string }) {}
  recordException(_error: any) {}
  setAttribute(_key: string, _value: any) {}
  addEvent(_name: string, _attributes?: Record<string, any>) {}
  end() {}
}

class NoopTracer {
  startSpan(_name: string): Span {
    return new NoopSpan()
  }

  startActiveSpan<T>(
    _name: string,
    _options: { attributes?: Record<string, any> } | undefined,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const span = new NoopSpan()
    return fn(span)
  }
}

const tracer = new NoopTracer()
let tracingInitialized = false

/**
 * Initialize OpenTelemetry tracing
 */
export function initializeTracing(): void {
  if (tracingInitialized) return
  tracingInitialized = true
  console.warn('[Tracing] OpenTelemetry disabled; using no-op tracer.')
}

/**
 * Get tracer instance
 */
export function getTracer() {
  return tracer
}

/**
 * Create a new span
 */
export function createSpan(_name: string): Span {
  return new NoopSpan()
}

/**
 * Execute function with tracing
 */
export async function withTracing<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const tracerInstance = getTracer()
  return tracerInstance.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn(span)
      span.setStatus({ code: 'OK' })
      return result
    } catch (error: any) {
      span.setStatus({ code: 'ERROR', message: error?.message })
      span.recordException(error)
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Add event to current span
 */
export function addEvent(_name: string, _attributes?: Record<string, any>): void {}

/**
 * Set attribute on current span
 */
export function setAttribute(_key: string, _value: any): void {}

/**
 * Set multiple attributes on current span
 */
export function setAttributes(_attributes: Record<string, any>): void {}

/**
 * Record exception in current span
 */
export function recordException(_error: Error): void {}

/**
 * Get current trace context
 */
export function getTraceContext(): any {
  return {}
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
export async function shutdownTracing(): Promise<void> {}

/**
 * Middleware for Next.js API routes
 */
export function withTracingMiddleware(handler: any) {
  return async (req: any, res: any) => handler(req, res)
}

/**
 * Get trace ID from current context
 */
export function getTraceId(): string | undefined {
  return undefined
}

/**
 * Get span ID from current context
 */
export function getSpanId(): string | undefined {
  return undefined
}

/**
 * Create custom metric
 */
export function recordMetric(_name: string, _value: number, _attributes?: Record<string, any>): void {}

// Initialize tracing on module load
if (process.env.OTEL_ENABLED === 'true') {
  initializeTracing()
}
