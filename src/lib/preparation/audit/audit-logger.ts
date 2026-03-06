/**
 * Audit Logger for Data Preparation Pipeline
 * Tracks who requested what, when, and with which purpose
 */

import { prisma } from '@/lib/prisma';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string | null;
  tenantId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export type AuditAction =
  | 'preparation.job.create'
  | 'preparation.job.cancel'
  | 'preparation.job.view'
  | 'preparation.data.access'
  | 'preparation.data.download'
  | 'preparation.config.update';

export class AuditLogger {
  /**
   * Log an audit event
   */
  async log(
    userId: string,
    tenantId: string,
    action: AuditAction,
    resourceType: string,
    resourceId: string,
    options?: {
      purpose?: string;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId,
        tenantId,
        action,
        resourceType,
        resourceId,
        metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
        status: 'SUCCESS',
      },
    });
  }

  /**
   * Log job creation
   */
  async logJobCreate(
    userId: string,
    tenantId: string,
    jobId: string,
    config: unknown,
    options?: {
      purpose?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    await this.log(userId, tenantId, 'preparation.job.create', 'job', jobId, {
      ...options,
      metadata: { config },
    });
  }

  /**
   * Log job cancellation
   */
  async logJobCancel(
    userId: string,
    tenantId: string,
    jobId: string,
    reason?: string,
    options?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    await this.log(userId, tenantId, 'preparation.job.cancel', 'job', jobId, {
      ...options,
      metadata: { reason },
    });
  }

  /**
   * Log job view
   */
  async logJobView(
    userId: string,
    tenantId: string,
    jobId: string,
    options?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    await this.log(userId, tenantId, 'preparation.job.view', 'job', jobId, options);
  }

  /**
   * Log data access
   */
  async logDataAccess(
    userId: string,
    tenantId: string,
    datasetId: string,
    purpose: string,
    options?: {
      metadata?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    await this.log(userId, tenantId, 'preparation.data.access', 'dataset', datasetId, {
      ...options,
      purpose,
    });
  }

  /**
   * Log data download
   */
  async logDataDownload(
    userId: string,
    tenantId: string,
    jobId: string,
    fileUrl: string,
    options?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    await this.log(userId, tenantId, 'preparation.data.download', 'job', jobId, {
      ...options,
      metadata: { fileUrl },
    });
  }

  /**
   * Get audit logs for a resource
   */
  async getLogsForResource(
    resourceId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLogEntry[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        resourceId,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    });

    return logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      userId: log.userId,
      tenantId: log.tenantId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      metadata: log.metadata ? JSON.parse(log.metadata) as Record<string, unknown> : undefined,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
    }));
  }

  /**
   * Get audit logs for a tenant
   */
  async getLogsForTenant(
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      action?: AuditAction;
    }
  ): Promise<AuditLogEntry[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: options?.action,
        timestamp: {
          gte: options?.startDate,
          lte: options?.endDate,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    });

    return logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      userId: log.userId,
      tenantId: log.tenantId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      metadata: log.metadata ? JSON.parse(log.metadata) as Record<string, unknown> : undefined,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
    }));
  }

  /**
   * Get audit logs for a user
   */
  async getLogsForUser(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLogEntry[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        userId,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    });

    return logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      userId: log.userId,
      tenantId: log.tenantId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      metadata: log.metadata ? JSON.parse(log.metadata) as Record<string, unknown> : undefined,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
    }));
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}

/**
 * Singleton instance
 */
export const auditLogger = new AuditLogger();
