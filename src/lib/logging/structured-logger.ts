/**
 * Structured Logging System
 * Production-grade logging with levels, context, and aggregation
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: {
    tenantId?: string;
    userId?: string;
    requestId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  tags?: string[];
}

class StructuredLogger {
  private minLevel: LogLevel = LogLevel.INFO;

  constructor(minLevel?: LogLevel) {
    if (minLevel) {
      this.minLevel = minLevel;
    }
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: any, metadata?: any): void {
    this.log(LogLevel.DEBUG, message, context, metadata);
  }

  /**
   * Log info message
   */
  info(message: string, context?: any, metadata?: any): void {
    this.log(LogLevel.INFO, message, context, metadata);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: any, metadata?: any): void {
    this.log(LogLevel.WARN, message, context, metadata);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: any, metadata?: any): void {
    const errorData = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : undefined;

    this.log(LogLevel.ERROR, message, context, metadata, errorData);
  }

  /**
   * Log fatal error
   */
  fatal(message: string, error?: Error, context?: any, metadata?: any): void {
    const errorData = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : undefined;

    this.log(LogLevel.FATAL, message, context, metadata, errorData);
  }

  /**
   * Core logging function
   */
  private log(
    level: LogLevel,
    message: string,
    context?: any,
    metadata?: any,
    error?: any
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      metadata,
      error,
    };

    // Console output
    this.outputToConsole(entry);

    // Store in database (async, non-blocking)
    this.storeInDatabase(entry).catch(err => {
      console.error('Failed to store log in database:', err);
    });
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    const minIndex = levels.indexOf(this.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  /**
   * Output to console with formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.padEnd(5);
    const message = entry.message;

    let output = `[${timestamp}] ${level} ${message}`;

    if (entry.context) {
      output += `\n  Context: ${JSON.stringify(entry.context)}`;
    }

    if (entry.metadata) {
      output += `\n  Metadata: ${JSON.stringify(entry.metadata)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output);
        break;
    }
  }

  /**
   * Store log in database
   */
  private async storeInDatabase(entry: LogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: entry.context?.tenantId,
          userId: entry.context?.userId,
          action: `LOG_${entry.level}`,
          resourceType: 'log',
          resourceId: `log_${Date.now()}`,
          metadata: JSON.stringify({
            message: entry.message,
            level: entry.level,
            context: entry.context,
            metadata: entry.metadata,
            error: entry.error,
            tags: entry.tags,
          }),
          status: entry.level === LogLevel.ERROR || entry.level === LogLevel.FATAL ? 'FAILED' : 'SUCCESS',
          timestamp: entry.timestamp,
          ipAddress: entry.context?.ipAddress,
          userAgent: entry.context?.userAgent,
        },
      });
    } catch (error) {
      // Don't throw - logging should never break the application
      console.error('Failed to store log:', error);
    }
  }

  /**
   * Create child logger with context
   */
  child(context: any): StructuredLogger {
    const childLogger = new StructuredLogger(this.minLevel);
    
    // Override log method to include parent context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, childContext?: any, metadata?: any, error?: any) => {
      const mergedContext = { ...context, ...childContext };
      originalLog(level, message, mergedContext, metadata, error);
    };

    return childLogger;
  }
}

// Export singleton instance
export const logger = new StructuredLogger(
  process.env.LOG_LEVEL as LogLevel || LogLevel.INFO
);

/**
 * Request logger middleware helper
 */
export function createRequestLogger(requestId: string, context?: any) {
  return logger.child({
    requestId,
    ...context,
  });
}

/**
 * Performance logger
 */
export class PerformanceLogger {
  private startTime: number;
  private logger: StructuredLogger;
  private operation: string;

  constructor(operation: string, context?: any) {
    this.operation = operation;
    this.startTime = Date.now();
    this.logger = logger.child(context);
    
    this.logger.debug(`Starting: ${operation}`);
  }

  /**
   * Mark completion and log duration
   */
  complete(metadata?: any): void {
    const duration = Date.now() - this.startTime;
    this.logger.info(`Completed: ${this.operation}`, undefined, {
      duration,
      ...metadata,
    });
  }

  /**
   * Mark failure and log error
   */
  fail(error: Error, metadata?: any): void {
    const duration = Date.now() - this.startTime;
    this.logger.error(`Failed: ${this.operation}`, error, undefined, {
      duration,
      ...metadata,
    });
  }
}

/**
 * Query logs from database
 */
export async function queryLogs(
  filters: {
    level?: LogLevel[];
    tenantId?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
  },
  limit: number = 100
): Promise<LogEntry[]> {
  try {
    const where: any = {
      action: {
        startsWith: 'LOG_',
      },
    };

    if (filters.tenantId) {
      where.tenantId = filters.tenantId;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    if (filters.level && filters.level.length > 0) {
      where.action = {
        in: filters.level.map(l => `LOG_${l}`),
      };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      select: {
        metadata: true,
        timestamp: true,
        tenantId: true,
        userId: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    const mapped = logs.map(log => {
      try {
        const data: any = JSON.parse((log.metadata as unknown as string) || '{}');
        const entry: LogEntry = {
          level: (data.level as LogLevel) ?? LogLevel.INFO,
          message: String(data.message ?? ''),
          timestamp: log.timestamp,
          context: {
            tenantId: log.tenantId || undefined,
            userId: log.userId || undefined,
            ipAddress: log.ipAddress || undefined,
            userAgent: log.userAgent || undefined,
          },
          metadata: data.metadata as Record<string, any> | undefined,
          error: data.error as LogEntry['error'],
          tags: data.tags as string[] | undefined,
        };
        return entry;
      } catch {
        return null as unknown as LogEntry;
      }
    });
    return mapped.filter((e): e is LogEntry => !!e);
  } catch (error) {
    console.error('Error querying logs:', error);
    return [];
  }
}

/**
 * Get log statistics
 */
export async function getLogStatistics(
  tenantId?: string,
  hours: number = 24
): Promise<{
  total: number;
  byLevel: Record<string, number>;
  errorRate: number;
}> {
  try {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    const where: any = {
      action: {
        startsWith: 'LOG_',
      },
      timestamp: {
        gte: startDate,
      },
    };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      select: {
        action: true,
      },
    });

    const byLevel: Record<string, number> = {};
    let errorCount = 0;

    for (const log of logs) {
      const level = log.action.replace('LOG_', '');
      byLevel[level] = (byLevel[level] || 0) + 1;
      
      if (level === 'ERROR' || level === 'FATAL') {
        errorCount++;
      }
    }

    return {
      total: logs.length,
      byLevel,
      errorRate: logs.length > 0 ? (errorCount / logs.length) * 100 : 0,
    };
  } catch (error) {
    console.error('Error getting log statistics:', error);
    return {
      total: 0,
      byLevel: {},
      errorRate: 0,
    };
  }
}
