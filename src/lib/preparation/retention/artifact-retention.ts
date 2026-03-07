/**
 * Artifact Retention Manager
 * 
 * Gerencia retenção, TTL e garbage collection de artefatos de preparação.
 * Remove arquivos antigos baseado em políticas configuráveis.
 */

import { prisma } from '@/lib/prisma';

// JobStatus baseado no schema Prisma
export type JobStatus = 'pending' | 'normalizing' | 'compiling' | 'delivering' | 'completed' | 'failed';

// Logger simples se não existir módulo
const logger = {
  info: (obj: any, msg?: string) => console.log(msg || obj, obj || ''),
  error: (obj: any, msg?: string) => console.error(msg || obj, obj || ''),
  warn: (obj: any, msg?: string) => console.warn(msg || obj, obj || ''),
};

export interface RetentionPolicy {
  /** Dias para manter jobs completados */
  completedJobRetentionDays: number;
  /** Dias para manter jobs falhos */
  failedJobRetentionDays: number;
  /** Máximo de artefatos por dataset */
  maxArtifactsPerDataset: number;
  /** Tamanho máximo total de storage por tenant (GB) */
  maxStoragePerTenantGB: number;
  /** Habilitar soft delete (marcar como deleted) antes de hard delete */
  enableSoftDelete: boolean;
  /** Dias para hard delete após soft delete */
  softDeleteGracePeriodDays: number;
}

export interface ArtifactMetadata {
  jobId: string;
  datasetId: string;
  tenantId: string;
  status: JobStatus;
  createdAt: Date;
  completedAt?: Date;
  sizeBytes: number;
  path: string;
  version?: string;
}

export interface CleanupResult {
  jobsProcessed: number;
  jobsSoftDeleted: number;
  jobsHardDeleted: number;
  bytesFreed: number;
  errors: string[];
  durationMs: number;
}

export interface StorageStats {
  tenantId: string;
  totalJobs: number;
  totalSizeBytes: number;
  totalSizeGB: number;
  byStatus: Record<JobStatus, { count: number; sizeBytes: number }>;
  byDataset: Record<string, { count: number; sizeBytes: number }>;
  oldestArtifact: Date;
  newestArtifact: Date;
}

/**
 * Configuração padrão de retenção
 */
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  completedJobRetentionDays: 30,
  failedJobRetentionDays: 7,
  cancelledJobRetentionDays: 3,
  maxArtifactsPerDataset: 50,
  maxStoragePerTenantGB: 100,
  enableSoftDelete: true,
  softDeleteGracePeriodDays: 7,
};

/**
 * Gerenciador de retenção de artefatos
 */
export class ArtifactRetentionManager {
  private policy: RetentionPolicy;
  private s3Client: any; // S3 client seria injetado

  constructor(policy: Partial<RetentionPolicy> = {}, s3Client?: any) {
    this.policy = { ...DEFAULT_RETENTION_POLICY, ...policy };
    this.s3Client = s3Client;
  }

  /**
   * Atualiza a política de retenção
   */
  updatePolicy(policy: Partial<RetentionPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    logger.info({ policy: this.policy }, 'Retention policy updated');
  }

  /**
   * Executa limpeza de artefatos expirados
   */
  async runCleanup(tenantId?: string): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      jobsProcessed: 0,
      jobsSoftDeleted: 0,
      jobsHardDeleted: 0,
      bytesFreed: 0,
      errors: [],
      durationMs: 0,
    };

    try {
      logger.info({ tenantId }, 'Starting artifact cleanup');

      // Busca jobs expirados por status
      const expiredJobs = await this.findExpiredJobs(tenantId);
      result.jobsProcessed = expiredJobs.length;

      for (const job of expiredJobs) {
        try {
          const bytes = await this.cleanupJob(job);
          result.bytesFreed += bytes;

          if (this.policy.enableSoftDelete && !job.deletedAt) {
            await this.softDeleteJob(job.id);
            result.jobsSoftDeleted++;
          } else {
            await this.hardDeleteJob(job.id);
            result.jobsHardDeleted++;
          }
        } catch (error) {
          const errorMsg = `Failed to cleanup job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          logger.error({ jobId: job.id, error }, errorMsg);
          result.errors.push(errorMsg);
        }
      }

      // Limpa soft deletes antigos
      if (this.policy.enableSoftDelete) {
        const hardDeleted = await this.cleanupSoftDeleted(tenantId);
        result.jobsHardDeleted += hardDeleted.count;
        result.bytesFreed += hardDeleted.bytes;
      }

      // Enforce limits por dataset
      const datasetCleanups = await this.enforceDatasetLimits(tenantId);
      result.jobsHardDeleted += datasetCleanups.count;
      result.bytesFreed += datasetCleanups.bytes;

      result.durationMs = Date.now() - startTime;

      logger.info({
        tenantId,
        result,
        durationMs: result.durationMs,
      }, 'Artifact cleanup completed');

      return result;
    } catch (error) {
      logger.error({ error, tenantId }, 'Artifact cleanup failed');
      throw error;
    }
  }

  /**
   * Encontra jobs expirados baseado na política de retenção
   */
  private async findExpiredJobs(tenantId?: string): Promise<Array<PreparationJob & { deletedAt?: Date }>> {
    const now = new Date();
    const expiredJobs: Array<PreparationJob & { deletedAt?: Date }> = [];

    // Busca jobs completados expirados
    const completedCutoff = new Date(now);
    completedCutoff.setDate(completedCutoff.getDate() - this.policy.completedJobRetentionDays);

    const completedJobs = await prisma.preparationJob.findMany({
      where: {
        status: 'completed',
        completedAt: { lt: completedCutoff },
        ...(tenantId && { tenantId }),
      },
      include: { dataset: true },
    });
    expiredJobs.push(...completedJobs as any);

    // Busca jobs falhos expirados
    const failedCutoff = new Date(now);
    failedCutoff.setDate(failedCutoff.getDate() - this.policy.failedJobRetentionDays);

    const failedJobs = await prisma.preparationJob.findMany({
      where: {
        status: 'failed',
        updatedAt: { lt: failedCutoff },
        ...(tenantId && { tenantId }),
      },
      include: { dataset: true },
    });
    expiredJobs.push(...failedJobs as any);

    // Busca jobs cancelados expirados
    const cancelledCutoff = new Date(now);
    cancelledCutoff.setDate(cancelledCutoff.getDate() - this.policy.cancelledJobRetentionDays);

    const cancelledJobs = await prisma.preparationJob.findMany({
      where: {
        status: 'cancelled',
        updatedAt: { lt: cancelledCutoff },
        ...(tenantId && { tenantId }),
      },
      include: { dataset: true },
    });
    expiredJobs.push(...cancelledJobs as any);

    return expiredJobs;
  }

  /**
   * Limpa artefatos de um job específico
   */
  private async cleanupJob(job: PreparationJob): Promise<number> {
    let bytesFreed = 0;

    // Calcula tamanho dos artefatos (do resultado ou estimativa)
    if (job.results?.delivery?.manifestPath) {
      // Em produção, buscaria tamanho real do S3
      bytesFreed = this.estimateArtifactSize(job);
    }

    // Remove arquivos do S3
    if (this.s3Client && job.outputPath) {
      try {
        await this.deleteS3Artifacts(job.outputPath);
      } catch (error) {
        logger.warn({ jobId: job.id, error }, 'Failed to delete S3 artifacts');
      }
    }

    // Remove arquivos locais se houver
    if (job.outputPath && !job.outputPath.startsWith('s3://')) {
      try {
        const fs = await import('fs/promises');
        await fs.rm(job.outputPath, { recursive: true, force: true });
      } catch (error) {
        logger.warn({ jobId: job.id, error }, 'Failed to delete local artifacts');
      }
    }

    return bytesFreed;
  }

  /** Calcula tamanho dos artefatos baseado nos campos de resultado do Prisma */
  private estimateArtifactSize(job: any): number {
    let size = 0;
    
    // Normalização
    if (job.normalizationResult) {
      const norm = job.normalizationResult as any;
      if (norm.recordCount) {
        size += norm.recordCount * 1024;
      }
    }

    // Compilação
    if (job.compilationResult) {
      const comp = job.compilationResult as any;
      if (comp.totalBytes) {
        size += comp.totalBytes;
      }
    }

    // Entrega
    if (job.deliveryResult) {
      const del = job.deliveryResult as any;
      if (del.totalBytes) {
        size += del.totalBytes;
      }
    }

    return size;
  }

  /**
   * Marca job como soft deleted
   */
  private async softDeleteJob(jobId: string): Promise<void> {
    await prisma.preparationJob.update({
      where: { id: jobId },
      data: {
        deletedAt: new Date(),
        outputPath: null, // Remove path mas mantém metadata
      },
    });

    logger.info({ jobId }, 'Job soft deleted');
  }

  /**
   * Remove job permanentemente
   */
  private async hardDeleteJob(jobId: string): Promise<void> {
    // Remove logs associados
    await prisma.jobLog.deleteMany({
      where: { jobId },
    });

    // Remove job
    await prisma.preparationJob.delete({
      where: { id: jobId },
    });

    logger.info({ jobId }, 'Job hard deleted');
  }

  /**
   * Limpa jobs que estão em soft delete há muito tempo
   */
  private async cleanupSoftDeleted(tenantId?: string): Promise<{ count: number; bytes: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.policy.softDeleteGracePeriodDays);

    const softDeletedJobs = await prisma.preparationJob.findMany({
      where: {
        deletedAt: { lt: cutoff },
        ...(tenantId && { tenantId }),
      },
    });

    let bytes = 0;
    for (const job of softDeletedJobs) {
      bytes += this.estimateArtifactSize(job as any);
      await this.hardDeleteJob(job.id);
    }

    return { count: softDeletedJobs.length, bytes };
  }

  /**
   * Enforce limites por dataset (mantém apenas os N mais recentes)
   */
  private async enforceDatasetLimits(tenantId?: string): Promise<{ count: number; bytes: number }> {
    const datasets = await prisma.dataset.findMany({
      where: tenantId ? { tenantId } : {},
      select: { id: true },
    });

    let totalCount = 0;
    let totalBytes = 0;

    for (const dataset of datasets) {
      const jobs = await prisma.preparationJob.findMany({
        where: {
          datasetId: dataset.id,
          status: { in: ['completed', 'failed'] },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        skip: this.policy.maxArtifactsPerDataset,
      });

      for (const job of jobs) {
        totalBytes += this.estimateArtifactSize(job as any);
        if (this.policy.enableSoftDelete) {
          await this.softDeleteJob(job.id);
        } else {
          await this.cleanupJob(job as any);
          await this.hardDeleteJob(job.id);
        }
        totalCount++;
      }
    }

    return { count: totalCount, bytes: totalBytes };
  }

  /**
   * Deleta artefatos do S3
   */
  private async deleteS3Artifacts(outputPath: string): Promise<void> {
    if (!this.s3Client) return;

    // Parse S3 path
    const match = outputPath.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!match) return;

    const [, bucket, prefix] = match;

    // Listar e deletar objetos
    // Implementação depende do cliente S3 usado
    logger.info({ bucket, prefix }, 'Deleting S3 artifacts');
  }

  /**
   * Coleta estatísticas de storage por tenant
   */
  async getStorageStats(tenantId: string): Promise<StorageStats> {
    const jobs = await prisma.preparationJob.findMany({
      where: { tenantId },
    });

    const stats: StorageStats = {
      tenantId,
      totalJobs: jobs.length,
      totalSizeBytes: 0,
      totalSizeGB: 0,
      byStatus: {
        pending: { count: 0, sizeBytes: 0 },
        processing: { count: 0, sizeBytes: 0 },
        completed: { count: 0, sizeBytes: 0 },
        failed: { count: 0, sizeBytes: 0 },
        cancelled: { count: 0, sizeBytes: 0 },
      },
      byDataset: {},
      oldestArtifact: new Date(),
      newestArtifact: new Date(),
    };

    let oldest = new Date();
    let newest = new Date(0);

    for (const job of jobs) {
      const size = this.estimateArtifactSize(job as any);
      stats.totalSizeBytes += size;

      const status = (job.status || 'pending') as JobStatus;
      stats.byStatus[status].count++;
      stats.byStatus[status].sizeBytes += size;

      const datasetId = (job as any).datasetId || 'unknown';
      if (!stats.byDataset[datasetId]) {
        stats.byDataset[datasetId] = { count: 0, sizeBytes: 0 };
      }
      stats.byDataset[datasetId].count++;
      stats.byDataset[datasetId].sizeBytes += size;

      const createdAt = job.createdAt;
      if (createdAt < oldest) oldest = createdAt;
      if (createdAt > newest) newest = createdAt;
    }

    stats.totalSizeGB = stats.totalSizeBytes / (1024 * 1024 * 1024);
    stats.oldestArtifact = oldest;
    stats.newestArtifact = newest;

    return stats;
  }

  /**
   * Calcula TTL restante para um job
   */
  calculateRemainingTTL(job: PreparationJob): number {
    const now = new Date();
    let retentionDays: number;

    switch (job.status) {
      case 'completed':
        retentionDays = this.policy.completedJobRetentionDays;
        break;
      case 'failed':
        retentionDays = this.policy.failedJobRetentionDays;
        break;
      case 'cancelled':
        retentionDays = this.policy.cancelledJobRetentionDays;
        break;
      default:
        return Infinity;
    }

    const endDate = job.completedAt || job.updatedAt;
    if (!endDate) return Infinity;

    const expirationDate = new Date(endDate);
    expirationDate.setDate(expirationDate.getDate() + retentionDays);

    const remaining = expirationDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
  }

  /**
   * Agenda cleanup automático (para ser chamado por cron job)
   */
  async scheduleCleanup(tenantId?: string, cronExpression?: string): Promise<void> {
    logger.info({
      tenantId,
      cronExpression: cronExpression || 'default daily',
      policy: this.policy,
    }, 'Scheduled cleanup configured');

    // Em produção, integrar com agendador (node-cron, bullmq repeat, etc)
  }
}

// Singleton instance
let retentionManager: ArtifactRetentionManager | null = null;

export function getRetentionManager(
  policy?: Partial<RetentionPolicy>,
  s3Client?: any
): ArtifactRetentionManager {
  if (!retentionManager) {
    retentionManager = new ArtifactRetentionManager(policy, s3Client);
  }
  return retentionManager;
}

export function resetRetentionManager(): void {
  retentionManager = null;
}
