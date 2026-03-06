/**
 * Structured Logger for Data Preparation Pipeline
 * Provides correlation IDs and structured logging
 */

import { randomUUID } from 'crypto';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogContext {
  correlationId: string;
  jobId?: string;
  datasetId?: string;
  stage?: string;
  userId?: string;
  tenantId?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class StructuredLogger {
  private context: LogContext;

  constructor(context?: Partial<LogContext>) {
    this.context = {
      correlationId: context?.correlationId || randomUUID(),
      ...context,
    };
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    const errorInfo = error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined;

    this.log(LogLevel.ERROR, message, metadata, errorInfo);
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: { name: string; message: string; stack?: string }
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      metadata,
      error,
    };

    // In production, this would send to a logging service (e.g., CloudWatch, Datadog)
    // For now, we'll use console with structured format
    const logMethod = this.getConsoleMethod(level);
    logMethod(JSON.stringify(entry));
  }

  /**
   * Get appropriate console method for log level
   */
  private getConsoleMethod(level: LogLevel): typeof console.log {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
        return console.error;
      default:
        return console.log;
    }
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string {
    return this.context.correlationId;
  }

  /**
   * Update context
   */
  updateContext(updates: Partial<LogContext>): void {
    this.context = {
      ...this.context,
      ...updates,
    };
  }
}

/**
 * Create logger for preparation job
 */
export function createJobLogger(jobId: string, datasetId: string): StructuredLogger {
  return new StructuredLogger({
    jobId,
    datasetId,
  });
}

/**
 * Create logger with correlation ID from request
 */
export function createRequestLogger(correlationId?: string): StructuredLogger {
  return new StructuredLogger({
    correlationId: correlationId || randomUUID(),
  });
}
