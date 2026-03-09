import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type PreparationStep = 'normalization' | 'compilation' | 'delivery' | 'validation' | 'setup';

export interface LogContext {
  [key: string]: unknown;
}

export interface JobLogEntry {
  id: string;
  jobId: string;
  tenantId: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  step?: PreparationStep;
  progress?: number;
  createdAt: Date;
}

export class JobLogger {
  private jobId: string;
  private tenantId: string;

  constructor(jobId: string, tenantId: string) {
    this.jobId = jobId;
    this.tenantId = tenantId;
  }

  /**
   * Log a debug message
   */
  async debug(message: string, context?: LogContext, step?: PreparationStep, progress?: number): Promise<void> {
    await this.log('debug', message, context, step, progress);
  }

  /**
   * Log an info message
   */
  async info(message: string, context?: LogContext, step?: PreparationStep, progress?: number): Promise<void> {
    await this.log('info', message, context, step, progress);
  }

  /**
   * Log a warning message
   */
  async warn(message: string, context?: LogContext, step?: PreparationStep, progress?: number): Promise<void> {
    await this.log('warn', message, context, step, progress);
  }

  /**
   * Log an error message
   */
  async error(message: string, context?: LogContext, step?: PreparationStep, progress?: number): Promise<void> {
    await this.log('error', message, context, step, progress);
  }

  /**
   * Log a message with the specified level
   */
  async log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    step?: PreparationStep,
    progress?: number
  ): Promise<void> {
    try {
      await prisma.jobLog.create({
        data: {
          jobId: this.jobId,
          tenantId: this.tenantId,
          level,
          message,
          context: context as any,
          step,
          progress,
        },
      });
    } catch (err) {
      // Fail silently - don't let logging errors break the job
      console.error(`Failed to write job log for job ${this.jobId}:`, err);
    }
  }

  /**
   * Log job start
   */
  async start(task: string, context?: LogContext): Promise<void> {
    await this.info(
      `Job started: ${task}`,
      context,
      'setup',
      0
    );
  }

  /**
   * Log step progress
   */
  async step(stepName: string, progress: number, context?: LogContext): Promise<void> {
    await this.info(
      `Step ${stepName}: ${progress}%`,
      context,
      stepName as PreparationStep,
      progress
    );
  }

  /**
   * Log job start (legacy)
   */
  async logStart(task: string, modality: string): Promise<void> {
    await this.info(
      `Starting preparation job: ${task} (${modality})`,
      { task, modality },
      'setup',
      0
    );
  }

  /**
   * Log job completion
   */
  async logCompletion(outputPath?: string): Promise<void> {
    await this.info(
      `Job completed successfully${outputPath ? `: ${outputPath}` : ''}`,
      { outputPath },
      'delivery',
      100
    );
  }

  /**
   * Log job failure
   */
  async logFailure(error: string | Error): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    await this.error(
      `Job failed: ${errorMessage}`,
      { error: errorMessage },
      'delivery',
      0
    );
  }

  /**
   * Log step progress
   */
  async logStep(step: PreparationStep, progress: number, message: string, context?: LogContext): Promise<void> {
    await this.info(message, context, step, progress);
  }
}

/**
 * Factory function to create a job logger
 */
export function createJobLogger(jobId: string, tenantId: string): JobLogger {
  return new JobLogger(jobId, tenantId);
}

/**
 * Retrieve logs for a specific job
 */
export async function getJobLogs(
  jobId: string,
  tenantId: string,
  options?: {
    level?: LogLevel;
    step?: PreparationStep;
    limit?: number;
    offset?: number;
  }
): Promise<{ logs: JobLogEntry[]; total: number }> {
  const { level, step, limit = 100, offset = 0 } = options || {};

  const where = {
    jobId,
    tenantId,
    ...(level && { level }),
    ...(step && { step }),
  };

  const [logs, total] = await Promise.all([
    prisma.jobLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.jobLog.count({ where }),
  ]);

  return { logs: logs as JobLogEntry[], total };
}

/**
 * Get latest log entries for a job
 */
export async function getLatestJobLogs(
  jobId: string,
  tenantId: string,
  count: number = 50
): Promise<JobLogEntry[]> {
  const logs = await prisma.jobLog.findMany({
    where: { jobId, tenantId },
    orderBy: { createdAt: 'desc' },
    take: count,
  });

  return logs as JobLogEntry[];
}

/**
 * Clean up old job logs (for data retention)
 */
export async function cleanupOldJobLogs(olderThanDays: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.jobLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}
