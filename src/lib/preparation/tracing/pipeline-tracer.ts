/**
 * OpenTelemetry Tracing for Data Preparation Pipeline
 * 
 * Implementação de tracing distribuído usando OpenTelemetry para observabilidade
 * do pipeline de preparação de dados.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { 
  trace, 
  Span, 
  SpanStatusCode, 
  Context,
  context,
} from '@opentelemetry/api';
import { logger } from '@/lib/logger';

export interface TracingConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
  sampleRate?: number;
  environment?: string;
}

export interface PipelineSpanContext {
  jobId: string;
  datasetId: string;
  tenantId: string;
  task: string;
  modality: string;
  parentSpan?: Span;
}

/**
 * OpenTelemetry Tracing Manager
 */
export class PipelineTracer {
  private sdk: NodeSDK | null = null;
  private config: TracingConfig;
  private tracer = trace.getTracer('xase-preparation-pipeline', '1.0.0');

  constructor(config?: Partial<TracingConfig>) {
    this.config = {
      enabled: process.env.OTEL_ENABLED === 'true',
      serviceName: 'xase-data-preparation',
      serviceVersion: '1.0.0',
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      otlpHeaders: this.parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
      sampleRate: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '1.0'),
      environment: process.env.NODE_ENV || 'development',
      ...config,
    };

    if (this.config.enabled) {
      this.initialize();
    }
  }

  private parseHeaders(headersStr?: string): Record<string, string> | undefined {
    if (!headersStr) return undefined;
    
    const headers: Record<string, string> = {};
    headersStr.split(',').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) {
        headers[key.trim()] = value.trim();
      }
    });
    return headers;
  }

  private initialize(): void {
    try {
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
      });

      const traceExporter = new OTLPTraceExporter({
        url: this.config.otlpEndpoint,
        headers: this.config.otlpHeaders,
      });

      this.sdk = new NodeSDK({
        resource,
        traceExporter,
        instrumentations: getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-fs': { enabled: false }, // Too noisy
        }),
      });

      this.sdk.start();
      logger.info('[PipelineTracer] OpenTelemetry tracing initialized');
    } catch (error) {
      logger.error('[PipelineTracer] Failed to initialize tracing:', error);
    }
  }

  /**
   * Inicia span para job de preparação
   */
  startJobSpan(ctx: PipelineSpanContext): Span {
    if (!this.config.enabled) {
      return this.createNoopSpan();
    }

    const span = this.tracer.startSpan('preparation.job', {
      attributes: {
        'job.id': ctx.jobId,
        'job.dataset_id': ctx.datasetId,
        'job.tenant_id': ctx.tenantId,
        'job.task': ctx.task,
        'job.modality': ctx.modality,
        'job.start_time': Date.now(),
      },
    });

    return span;
  }

  /**
   * Inicia span para etapa de normalização
   */
  startNormalizationSpan(parentContext: Context, jobId: string): Span {
    if (!this.config.enabled) {
      return this.createNoopSpan();
    }

    return this.tracer.startSpan(
      'preparation.normalization',
      {
        attributes: {
          'step.name': 'normalization',
          'job.id': jobId,
        },
      },
      parentContext
    );
  }

  /**
   * Inicia span para etapa de compilação
   */
  startCompilationSpan(parentContext: Context, jobId: string, format: string): Span {
    if (!this.config.enabled) {
      return this.createNoopSpan();
    }

    return this.tracer.startSpan(
      'preparation.compilation',
      {
        attributes: {
          'step.name': 'compilation',
          'compilation.format': format,
          'job.id': jobId,
        },
      },
      parentContext
    );
  }

  /**
   * Inicia span para etapa de entrega
   */
  startDeliverySpan(parentContext: Context, jobId: string): Span {
    if (!this.config.enabled) {
      return this.createNoopSpan();
    }

    return this.tracer.startSpan(
      'preparation.delivery',
      {
        attributes: {
          'step.name': 'delivery',
          'job.id': jobId,
        },
      },
      parentContext
    );
  }

  /**
   * Inicia span para operação S3
   */
  startS3OperationSpan(
    parentContext: Context,
    operation: string,
    bucket: string,
    key?: string
  ): Span {
    if (!this.config.enabled) {
      return this.createNoopSpan();
    }

    return this.tracer.startSpan(
      `s3.${operation}`,
      {
        attributes: {
          's3.operation': operation,
          's3.bucket': bucket,
          's3.key': key,
        },
      },
      parentContext
    );
  }

  /**
   * Inicia span para operação de banco de dados
   */
  startDatabaseSpan(
    parentContext: Context,
    operation: string,
    table: string
  ): Span {
    if (!this.config.enabled) {
      return this.createNoopSpan();
    }

    return this.tracer.startSpan(
      `db.${operation}`,
      {
        attributes: {
          'db.system': 'postgresql',
          'db.operation': operation,
          'db.table': table,
        },
      },
      parentContext
    );
  }

  /**
   * Inicia span para de-identification
   */
  startDeidSpan(
    parentContext: Context,
    method: string,
    modality: string
  ): Span {
    if (!this.config.enabled) {
      return this.createNoopSpan();
    }

    return this.tracer.startSpan(
      'deid.process',
      {
        attributes: {
          'deid.method': method,
          'deid.modality': modality,
        },
      },
      parentContext
    );
  }

  /**
   * Registra métricas em um span
   */
  recordMetrics(span: Span, metrics: Record<string, number | string | boolean>): void {
    if (!this.config.enabled || !span.isRecording()) {
      return;
    }

    Object.entries(metrics).forEach(([key, value]) => {
      span.setAttribute(`metric.${key}`, value);
    });
  }

  /**
   * Registra evento em um span
   */
  recordEvent(span: Span, name: string, attributes?: Record<string, unknown>): void {
    if (!this.config.enabled || !span.isRecording()) {
      return;
    }

    span.addEvent(name, attributes);
  }

  /**
   * Finaliza span com sucesso
   */
  endSpan(span: Span, attributes?: Record<string, unknown>): void {
    if (span.isRecording()) {
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }
  }

  /**
   * Finaliza span com erro
   */
  endSpanWithError(span: Span, error: Error, attributes?: Record<string, unknown>): void {
    if (span.isRecording()) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });
      }
      span.end();
    }
  }

  /**
   * Cria span noop para quando tracing está desabilitado
   */
  private createNoopSpan(): Span {
    return {
      isRecording: () => false,
      setAttribute: () => {},
      setAttributes: () => {},
      addEvent: () => {},
      recordException: () => {},
      setStatus: () => {},
      updateName: () => this.createNoopSpan() as any,
      end: () => {},
      spanContext: () => ({
        traceId: '00000000000000000000000000000000',
        spanId: '0000000000000000',
        traceFlags: 0,
        isRemote: false,
      }),
    } as Span;
  }

  /**
   * Atualiza configuração em runtime
   */
  updateConfig(config: Partial<TracingConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.enabled && !this.sdk) {
      this.initialize();
    } else if (!config.enabled && this.sdk) {
      this.shutdown();
    }
  }

  /**
   * Desliga tracing
   */
  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.sdk = null;
      logger.info('[PipelineTracer] OpenTelemetry tracing shutdown');
    }
  }

  /**
   * Força flush de spans pendentes
   */
  async forceFlush(): Promise<void> {
    if (this.sdk) {
      // O SDK não expõe forceFlush diretamente, mas o exporter envia periodicamente
      logger.debug('[PipelineTracer] Force flush requested');
    }
  }
}

// Singleton instance
let tracer: PipelineTracer | null = null;

export function getPipelineTracer(config?: Partial<TracingConfig>): PipelineTracer {
  if (!tracer) {
    tracer = new PipelineTracer(config);
  }
  return tracer;
}

export function resetPipelineTracer(): void {
  tracer = null;
}

/**
 * Decorator para tracing automático de métodos
 */
export function TraceSpan(operationName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const pipelineTracer = getPipelineTracer();

    descriptor.value = async function (...args: any[]) {
      const span = pipelineTracer['tracer'].startSpan(operationName, {
        attributes: {
          'operation.name': operationName,
          'operation.method': propertyKey,
        },
      });

      try {
        const result = await originalMethod.apply(this, args);
        pipelineTracer.endSpan(span, { 'operation.success': true });
        return result;
      } catch (error) {
        pipelineTracer.endSpanWithError(
          span,
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      }
    };

    return descriptor;
  };
}
