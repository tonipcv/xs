/**
 * Versioning and TTL Manager for Data Preparation Artifacts
 * Manages incremental versions and retention policies
 * With git commit hash integration for full reproducibility
 */

import { createHash } from 'crypto';
import { execSync } from 'child_process';

export interface VersionConfig {
  datasetId: string;
  config: Record<string, unknown>;
  seed?: number;
  commitHash?: string;
}

export interface VersionInfo {
  version: string; // v1, v2, v3, etc.
  configHash: string;
  gitCommitHash?: string;
  seed: number;
  commitHash?: string; // Legacy field
  createdAt: Date;
  isReproducible: boolean;
}

export interface TTLPolicy {
  maxVersions: number;
  ttlDays: number;
  keepLatest: boolean;
}

export interface ArtifactMetadata {
  path: string;
  version: string;
  sizeBytes: number;
  createdAt: Date;
  lastAccessedAt?: Date;
  configHash: string;
  gitCommitHash?: string;
}

export interface ReproducibilityManifest {
  datasetId: string;
  version: string;
  configHash: string;
  gitCommitHash: string;
  seed: number;
  commandLine: string;
  environment: Record<string, string>;
  timestamp: string;
}

export class VersioningManager {
  private versions: Map<string, VersionInfo[]> = new Map();
  private artifacts: Map<string, ArtifactMetadata[]> = new Map();

  /**
   * Get current git commit hash
   */
  getGitCommitHash(): string {
    try {
      // Try to get the current git commit hash
      const hash = execSync('git rev-parse HEAD', { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr
      }).trim();
      return hash;
    } catch {
      // If git command fails, try environment variable
      return process.env.GIT_COMMIT_HASH || 'unknown';
    }
  }

  /**
   * Get full reproducibility context
   */
  getReproducibilityContext(): {
    gitCommitHash: string;
    gitBranch: string;
    gitTag?: string;
    nodeVersion: string;
    platform: string;
  } {
    let gitBranch = 'unknown';
    let gitTag: string | undefined;
    
    try {
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      
      // Try to get current tag if any
      gitTag = execSync('git describe --tags --exact-match 2>/dev/null || echo ""', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim() || undefined;
    } catch {
      // Use env variables as fallback
      gitBranch = process.env.GIT_BRANCH || 'unknown';
      gitTag = process.env.GIT_TAG;
    }

    return {
      gitCommitHash: this.getGitCommitHash(),
      gitBranch,
      gitTag,
      nodeVersion: process.version,
      platform: `${process.platform}-${process.arch}`,
    };
  }

  /**
   * Calculate config hash for reproducibility tracking
   */
  calculateConfigHash(config: Record<string, unknown>): string {
    const sorted = Object.keys(config).sort().reduce((acc, key) => {
      acc[key] = config[key];
      return acc;
    }, {} as Record<string, unknown>);
    
    return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').substring(0, 16);
  }

  /**
   * Generate new version for dataset + config combination
   */
  generateVersion(config: VersionConfig): VersionInfo {
    const datasetVersions = this.versions.get(config.datasetId) || [];
    const configHash = this.calculateConfigHash(config.config);
    const gitCommitHash = config.commitHash || this.getGitCommitHash();
    
    // Check if this exact config was used before
    const existingVersion = datasetVersions.find((v) => v.configHash === configHash);
    if (existingVersion) {
      return existingVersion;
    }

    // Create new version
    const versionNumber = datasetVersions.length + 1;
    const version: VersionInfo = {
      version: `v${versionNumber}`,
      configHash,
      gitCommitHash,
      commitHash: gitCommitHash, // Legacy field for backwards compatibility
      seed: config.seed ?? Date.now(),
      createdAt: new Date(),
      isReproducible: !!config.seed,
    };

    datasetVersions.push(version);
    this.versions.set(config.datasetId, datasetVersions);

    return version;
  }

  /**
   * Get version history for a dataset
   */
  getVersionHistory(datasetId: string): VersionInfo[] {
    return this.versions.get(datasetId) || [];
  }

  /**
   * Get specific version info
   */
  getVersion(datasetId: string, version: string): VersionInfo | undefined {
    const versions = this.versions.get(datasetId) || [];
    return versions.find((v) => v.version === version);
  }

  /**
   * Register artifact with version
   */
  registerArtifact(
    datasetId: string,
    path: string,
    version: string,
    sizeBytes: number,
    configHash: string
  ): ArtifactMetadata {
    const artifacts = this.artifacts.get(datasetId) || [];
    
    const artifact: ArtifactMetadata = {
      path,
      version,
      sizeBytes,
      createdAt: new Date(),
      configHash,
    };

    artifacts.push(artifact);
    this.artifacts.set(datasetId, artifacts);

    return artifact;
  }

  /**
   * Apply TTL policy to artifacts
   */
  applyTTL(datasetId: string, policy: TTLPolicy): {
    deleted: ArtifactMetadata[];
    kept: ArtifactMetadata[];
  } {
    const artifacts = this.artifacts.get(datasetId) || [];
    const now = new Date();
    const deleted: ArtifactMetadata[] = [];
    const kept: ArtifactMetadata[] = [];

    // Sort by creation date (newest first)
    const sorted = [...artifacts].sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );

    for (let i = 0; i < sorted.length; i++) {
      const artifact = sorted[i];
      const ageDays = (now.getTime() - artifact.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const isLatest = i === 0;

      // Keep if it's latest and policy says so
      if (isLatest && policy.keepLatest) {
        kept.push(artifact);
        continue;
      }

      // Keep if within TTL and under max versions
      if (ageDays <= policy.ttlDays && i < policy.maxVersions) {
        kept.push(artifact);
        continue;
      }

      // Delete otherwise
      deleted.push(artifact);
    }

    // Update registry
    this.artifacts.set(datasetId, kept);

    return { deleted, kept };
  }

  /**
   * Check if version is reproducible (has seed)
   */
  isReproducible(datasetId: string, version: string): boolean {
    const v = this.getVersion(datasetId, version);
    return v?.isReproducible ?? false;
  }

  /**
   * Get reproducibility report
   */
  getReproducibilityReport(datasetId: string): {
    totalVersions: number;
    reproducibleVersions: number;
    nonReproducibleVersions: number;
    seedUsage: Record<string, number>;
  } {
    const versions = this.versions.get(datasetId) || [];
    const reproducible = versions.filter((v) => v.isReproducible);
    
    const seedUsage: Record<string, number> = {};
    for (const v of versions) {
      if (v.isReproducible) {
        const seed = v.seed.toString();
        seedUsage[seed] = (seedUsage[seed] || 0) + 1;
      }
    }

    return {
      totalVersions: versions.length,
      reproducibleVersions: reproducible.length,
      nonReproducibleVersions: versions.length - reproducible.length,
      seedUsage,
    };
  }

  /**
   * Get storage statistics
   */
  getStorageStats(datasetId: string): {
    totalArtifacts: number;
    totalSizeBytes: number;
    avgSizeBytes: number;
    oldestArtifact: Date | null;
    newestArtifact: Date | null;
  } {
    const artifacts = this.artifacts.get(datasetId) || [];
    
    if (artifacts.length === 0) {
      return {
        totalArtifacts: 0,
        totalSizeBytes: 0,
        avgSizeBytes: 0,
        oldestArtifact: null,
        newestArtifact: null,
      };
    }

    const totalSize = artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);
    const dates = artifacts.map((a) => a.createdAt.getTime());

    return {
      totalArtifacts: artifacts.length,
      totalSizeBytes: totalSize,
      avgSizeBytes: totalSize / artifacts.length,
      oldestArtifact: new Date(Math.min(...dates)),
      newestArtifact: new Date(Math.max(...dates)),
    };
  }

  /**
   * Export version manifest
   */
  exportManifest(datasetId: string): {
    datasetId: string;
    exportedAt: string;
    versions: VersionInfo[];
    artifacts: ArtifactMetadata[];
  } {
    return {
      datasetId,
      exportedAt: new Date().toISOString(),
      versions: this.getVersionHistory(datasetId),
      artifacts: this.artifacts.get(datasetId) || [],
    };
  }

  /**
   * Generate full reproducibility manifest
   */
  generateReproducibilityManifest(
    datasetId: string,
    version: string,
    config: Record<string, unknown>
  ): ReproducibilityManifest {
    const context = this.getReproducibilityContext();
    
    return {
      datasetId,
      version,
      configHash: this.calculateConfigHash(config),
      gitCommitHash: context.gitCommitHash,
      seed: Date.now(),
      commandLine: process.argv.join(' '),
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PLATFORM: context.platform,
        NODE_VERSION: context.nodeVersion,
        GIT_BRANCH: context.gitBranch,
        ...(context.gitTag && { GIT_TAG: context.gitTag }),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
