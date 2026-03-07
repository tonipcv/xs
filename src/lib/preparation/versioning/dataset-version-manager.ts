/**
 * Dataset Version Manager
 * 
 * Gerencia versionamento incremental de datasets (v1, v2, v3...)
 * Permite rastrear mudanças, rollback e comparar versões.
 */

import { prisma } from '@/lib/prisma';

export interface DatasetVersion {
  version: number;
  jobId: string;
  createdAt: Date;
  description?: string;
  changes: VersionChange[];
  manifestPath?: string;
  downloadUrls?: string[];
  recordCount?: number;
  sizeBytes?: number;
  checksum?: string;
}

export interface VersionChange {
  type: 'added' | 'removed' | 'modified' | 'schema_change';
  description: string;
  count?: number;
  fields?: string[];
}

export interface VersionComparison {
  fromVersion: number;
  toVersion: number;
  added: number;
  removed: number;
  modified: number;
  schemaChanges: string[];
  sizeDeltaBytes: number;
}

export interface VersionMetadata {
  currentVersion: number;
  totalVersions: number;
  versions: DatasetVersion[];
  canRollback: boolean;
}

/**
 * Gerenciador de versões de dataset
 */
export class DatasetVersionManager {
  /**
   * Obtém a próxima versão para um dataset
   */
  async getNextVersion(datasetId: string): Promise<number> {
    const jobs = await prisma.preparationJob.findMany({
      where: {
        datasetId,
        status: 'completed',
        outputPath: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    });

    return jobs.length + 1;
  }

  /**
   * Registra uma nova versão após job completado
   */
  async registerVersion(
    datasetId: string,
    jobId: string,
    options: {
      description?: string;
      changes?: VersionChange[];
      previousVersion?: number;
    } = {}
  ): Promise<DatasetVersion> {
    const version = await this.getNextVersion(datasetId);

    // Busca informações do job
    const job = await prisma.preparationJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Extrai métricas dos resultados
    const deliveryResult = job.deliveryResult as any;
    const compilationResult = job.compilationResult as any;

    const datasetVersion: DatasetVersion = {
      version,
      jobId,
      createdAt: new Date(),
      description: options.description || `Version ${version} from job ${jobId}`,
      changes: options.changes || [],
      manifestPath: job.manifestPath || undefined,
      downloadUrls: job.downloadUrls ? (job.downloadUrls as any[]).map(u => u.url || u) : undefined,
      recordCount: compilationResult?.recordCount || compilationResult?.totalRecords,
      sizeBytes: deliveryResult?.totalBytes || compilationResult?.totalBytes,
      checksum: deliveryResult?.manifestChecksum,
    };

    // Armazena metadados da versão no dataset
    await this.saveVersionMetadata(datasetId, datasetVersion);

    return datasetVersion;
  }

  /**
   * Lista todas as versões de um dataset
   */
  async listVersions(datasetId: string): Promise<VersionMetadata> {
    const jobs = await prisma.preparationJob.findMany({
      where: {
        datasetId,
        status: 'completed',
        outputPath: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    });

    const versions: DatasetVersion[] = jobs.map((job, index) => {
      const deliveryResult = job.deliveryResult as any;
      const compilationResult = job.compilationResult as any;

      return {
        version: index + 1,
        jobId: job.id,
        createdAt: job.completedAt || job.createdAt,
        manifestPath: job.manifestPath || undefined,
        downloadUrls: job.downloadUrls ? (job.downloadUrls as any[]).map(u => u.url || u) : undefined,
        recordCount: compilationResult?.recordCount || compilationResult?.totalRecords,
        sizeBytes: deliveryResult?.totalBytes || compilationResult?.totalBytes,
        checksum: deliveryResult?.manifestChecksum,
        changes: [], // Simplificado - em produção buscaria de changelog
      };
    });

    return {
      currentVersion: versions.length,
      totalVersions: versions.length,
      versions,
      canRollback: versions.length > 1,
    };
  }

  /**
   * Obtém uma versão específica
   */
  async getVersion(datasetId: string, version: number): Promise<DatasetVersion | null> {
    const metadata = await this.listVersions(datasetId);
    return metadata.versions.find(v => v.version === version) || null;
  }

  /**
   * Compara duas versões
   */
  async compareVersions(
    datasetId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<VersionComparison> {
    const v1 = await this.getVersion(datasetId, fromVersion);
    const v2 = await this.getVersion(datasetId, toVersion);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const sizeDelta = (v2.sizeBytes || 0) - (v1.sizeBytes || 0);
    const recordDelta = (v2.recordCount || 0) - (v1.recordCount || 0);

    return {
      fromVersion,
      toVersion,
      added: Math.max(0, recordDelta),
      removed: Math.max(0, -recordDelta),
      modified: 0, // Requer análise profunda dos dados
      schemaChanges: this.detectSchemaChanges(v1, v2),
      sizeDeltaBytes: sizeDelta,
    };
  }

  /**
   * Realiza rollback para uma versão anterior
   * (Marca versões posteriores como obsoletas)
   */
  async rollbackToVersion(
    datasetId: string,
    targetVersion: number,
    requestedBy: string
  ): Promise<{ success: boolean; message: string }> {
    const metadata = await this.listVersions(datasetId);

    if (targetVersion < 1 || targetVersion > metadata.currentVersion) {
      return { success: false, message: 'Invalid version number' };
    }

    if (targetVersion === metadata.currentVersion) {
      return { success: false, message: 'Already at target version' };
    }

    // Marca jobs das versões posteriores como rolled back
    const versionsToRollback = metadata.versions.filter(v => v.version > targetVersion);

    for (const version of versionsToRollback) {
      await prisma.preparationJob.update({
        where: { id: version.jobId },
        data: {
          status: 'failed', // Ou 'rolled_back' se adicionarmos esse status
          error: `Rolled back to version ${targetVersion} by ${requestedBy} at ${new Date().toISOString()}`,
        },
      });
    }

    return {
      success: true,
      message: `Rolled back from v${metadata.currentVersion} to v${targetVersion}. ${versionsToRollback.length} versions marked as obsolete.`,
    };
  }

  /**
   * Gera changelog entre versões
   */
  async generateChangelog(
    datasetId: string,
    fromVersion?: number,
    toVersion?: number
  ): Promise<string> {
    const metadata = await this.listVersions(datasetId);
    
    const start = fromVersion || 1;
    const end = toVersion || metadata.currentVersion;

    const relevantVersions = metadata.versions.filter(
      v => v.version >= start && v.version <= end
    );

    let changelog = `# Dataset ${datasetId} Changelog (v${start}..v${end})\n\n`;

    for (const version of relevantVersions) {
      changelog += `## Version ${version.version} (${version.createdAt.toISOString()})\n`;
      if (version.description) {
        changelog += `${version.description}\n`;
      }
      if (version.recordCount !== undefined) {
        changelog += `- Records: ${version.recordCount.toLocaleString()}\n`;
      }
      if (version.sizeBytes !== undefined) {
        changelog += `- Size: ${(version.sizeBytes / 1024 / 1024).toFixed(2)} MB\n`;
      }
      if (version.checksum) {
        changelog += `- Checksum: \`${version.checksum}\`\n`;
      }
      changelog += '\n';
    }

    return changelog;
  }

  /**
   * Verifica integridade de uma versão
   */
  async verifyVersionIntegrity(
    datasetId: string,
    version: number
  ): Promise<{
    valid: boolean;
    issues: string[];
    checksumValid: boolean;
  }> {
    const v = await this.getVersion(datasetId, version);
    const issues: string[] = [];

    if (!v) {
      return { valid: false, issues: ['Version not found'], checksumValid: false };
    }

    // Verifica se manifest existe
    if (!v.manifestPath) {
      issues.push('Missing manifest path');
    }

    // Verifica se download URLs existem
    if (!v.downloadUrls || v.downloadUrls.length === 0) {
      issues.push('Missing download URLs');
    }

    // Verifica checksum (simplificado)
    const checksumValid = !!v.checksum;

    return {
      valid: issues.length === 0,
      issues,
      checksumValid,
    };
  }

  /**
   * Salva metadados de versão no dataset
   * (Armazena como JSON no campo metadata do dataset)
   */
  private async saveVersionMetadata(
    datasetId: string,
    version: DatasetVersion
  ): Promise<void> {
    // Busca versões existentes
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      select: { metadata: true },
    });

    const existingMetadata = (dataset?.metadata as any) || {};
    const versions = existingMetadata.versions || [];

    versions.push(version);

    await prisma.dataset.update({
      where: { id: datasetId },
      data: {
        metadata: {
          ...existingMetadata,
          versions,
          currentVersion: version.version,
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Detecta mudanças de schema entre versões
   */
  private detectSchemaChanges(v1: DatasetVersion, v2: DatasetVersion): string[] {
    const changes: string[] = [];

    // Compara campos presentes em cada versão
    const v1Fields = v1.changes.find(c => c.type === 'schema_change')?.fields || [];
    const v2Fields = v2.changes.find(c => c.type === 'schema_change')?.fields || [];

    const added = v2Fields.filter(f => !v1Fields.includes(f));
    const removed = v1Fields.filter(f => !v2Fields.includes(f));

    if (added.length > 0) {
      changes.push(`Added fields: ${added.join(', ')}`);
    }
    if (removed.length > 0) {
      changes.push(`Removed fields: ${removed.join(', ')}`);
    }

    return changes;
  }

  /**
   * Calcula estatísticas de evolução do dataset
   */
  async getEvolutionStats(datasetId: string): Promise<{
    totalGrowthRecords: number;
    totalGrowthBytes: number;
    averageVersionSize: number;
    mostActiveDay?: Date;
    versionFrequency: 'daily' | 'weekly' | 'monthly' | 'rare';
  }> {
    const metadata = await this.listVersions(datasetId);
    const versions = metadata.versions;

    if (versions.length < 2) {
      return {
        totalGrowthRecords: 0,
        totalGrowthBytes: 0,
        averageVersionSize: versions[0]?.sizeBytes || 0,
        versionFrequency: 'rare',
      };
    }

    const first = versions[0];
    const last = versions[versions.length - 1];

    const totalGrowthRecords = (last.recordCount || 0) - (first.recordCount || 0);
    const totalGrowthBytes = (last.sizeBytes || 0) - (first.sizeBytes || 0);
    const averageVersionSize = versions.reduce((sum, v) => sum + (v.sizeBytes || 0), 0) / versions.length;

    // Calcula frequência
    const firstDate = first.createdAt.getTime();
    const lastDate = last.createdAt.getTime();
    const daysSpan = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
    const versionsPerDay = versions.length / Math.max(1, daysSpan);

    let versionFrequency: 'daily' | 'weekly' | 'monthly' | 'rare';
    if (versionsPerDay >= 0.5) versionFrequency = 'daily';
    else if (versionsPerDay >= 0.1) versionFrequency = 'weekly';
    else if (versionsPerDay >= 0.02) versionFrequency = 'monthly';
    else versionFrequency = 'rare';

    return {
      totalGrowthRecords,
      totalGrowthBytes,
      averageVersionSize,
      versionFrequency,
    };
  }
}

// Singleton instance
let versionManager: DatasetVersionManager | null = null;

export function getVersionManager(): DatasetVersionManager {
  if (!versionManager) {
    versionManager = new DatasetVersionManager();
  }
  return versionManager;
}

export function resetVersionManager(): void {
  versionManager = null;
}
