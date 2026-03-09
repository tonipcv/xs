/**
 * Artifact TTL Cleanup Job
 * Runs periodically to clean up old preparation artifacts based on TTL policies
 * 
 * Usage:
 *   tsx src/lib/preparation/jobs/artifact-cleanup-job.ts
 * 
 * Environment variables:
 *   - ARTIFACT_TTL_DAYS: Number of days to keep artifacts (default: 30)
 *   - ARTIFACT_MAX_VERSIONS: Maximum number of versions to keep per dataset (default: 10)
 *   - ARTIFACT_KEEP_LATEST: Always keep the latest version (default: true)
 *   - DRY_RUN: If true, only logs what would be deleted without actually deleting (default: false)
 */

import { VersioningManager, TTLPolicy } from '../versioning/versioning-manager';
import { prisma } from '@/lib/prisma';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

interface CleanupConfig {
  ttlDays: number;
  maxVersions: number;
  keepLatest: boolean;
  dryRun: boolean;
}

interface CleanupResult {
  datasetId: string;
  artifactsDeleted: number;
  artifactsKept: number;
  bytesFreed: number;
  errors: string[];
}

class ArtifactCleanupJob {
  private versioningManager: VersioningManager;
  private s3Client: S3Client | null;
  private bucket: string;
  private config: CleanupConfig;

  constructor(config: Partial<CleanupConfig> = {}) {
    this.versioningManager = new VersioningManager();
    this.config = {
      ttlDays: parseInt(process.env.ARTIFACT_TTL_DAYS || '30'),
      maxVersions: parseInt(process.env.ARTIFACT_MAX_VERSIONS || '10'),
      keepLatest: process.env.ARTIFACT_KEEP_LATEST !== 'false',
      dryRun: process.env.DRY_RUN === 'true',
      ...config,
    };

    // Initialize S3 client if credentials available
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.s3Client = null;
    }

    this.bucket = process.env.S3_BUCKET || 'xase-datasets';
  }

  /**
   * Load artifact metadata from database
   */
  private async loadArtifactsFromDB(datasetId: string): Promise<Array<{
    path: string;
    version: string;
    sizeBytes: number;
    createdAt: Date;
    configHash: string;
  }>> {
    const jobs = await prisma.preparationJob.findMany({
      where: {
        datasetId,
        status: 'completed',
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        outputPath: true,
        manifestPath: true,
        checksumPath: true,
        readmePath: true,
        completedAt: true,
      },
    });

    const artifacts: Array<{
      path: string;
      version: string;
      sizeBytes: number;
      createdAt: Date;
      configHash: string;
    }> = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const version = `v${jobs.length - i}`; // Oldest is v1
      const paths = [
        job.outputPath,
        job.manifestPath,
        job.checksumPath,
        job.readmePath,
      ].filter(Boolean) as string[];

      for (const path of paths) {
        if (path) {
          artifacts.push({
            path,
            version,
            sizeBytes: 0, // Would need to query S3 for actual size
            createdAt: job.completedAt!,
            configHash: '', // Would need to calculate from config
          });
        }
      }
    }

    return artifacts;
  }

  /**
   * Delete artifact from S3
   */
  private async deleteS3Artifact(key: string): Promise<boolean> {
    if (!this.s3Client) {
      console.log(`[DRY-RUN] Would delete S3 object: ${key}`);
      return true;
    }

    if (this.config.dryRun) {
      console.log(`[DRY-RUN] Would delete S3 object: ${key}`);
      return true;
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error) {
      console.error(`Failed to delete S3 object ${key}:`, error);
      return false;
    }
  }

  /**
   * Clean up artifacts for a single dataset
   */
  async cleanupDataset(datasetId: string): Promise<CleanupResult> {
    const result: CleanupResult = {
      datasetId,
      artifactsDeleted: 0,
      artifactsKept: 0,
      bytesFreed: 0,
      errors: [],
    };

    console.log(`\nProcessing dataset: ${datasetId}`);

    // Load artifacts from database
    const artifacts = await this.loadArtifactsFromDB(datasetId);

    if (artifacts.length === 0) {
      console.log(`  No artifacts found for dataset ${datasetId}`);
      return result;
    }

    console.log(`  Found ${artifacts.length} artifacts`);

    // Register artifacts with versioning manager
    for (const artifact of artifacts) {
      this.versioningManager.registerArtifact(
        datasetId,
        artifact.path,
        artifact.version,
        artifact.sizeBytes,
        artifact.configHash
      );
    }

    // Apply TTL policy
    const policy: TTLPolicy = {
      maxVersions: this.config.maxVersions,
      ttlDays: this.config.ttlDays,
      keepLatest: this.config.keepLatest,
    };

    const ttlResult = this.versioningManager.applyTTL(datasetId, policy);

    // Delete artifacts marked for deletion
    for (const artifact of ttlResult.deleted) {
      const success = await this.deleteS3Artifact(artifact.path);
      if (success) {
        result.artifactsDeleted++;
        result.bytesFreed += artifact.sizeBytes;
        console.log(`  ✓ Deleted: ${artifact.path} (v${artifact.version})`);
      } else {
        result.errors.push(`Failed to delete: ${artifact.path}`);
      }
    }

    // Count kept artifacts
    result.artifactsKept = ttlResult.kept.length;

    for (const artifact of ttlResult.kept) {
      console.log(`  → Kept: ${artifact.path} (v${artifact.version})`);
    }

    return result;
  }

  /**
   * Run cleanup for all datasets
   */
  async run(): Promise<{
    totalDatasets: number;
    totalArtifactsDeleted: number;
    totalBytesFreed: number;
    errors: string[];
  }> {
    console.log('=== Artifact Cleanup Job ===');
    console.log(`Config: TTL=${this.config.ttlDays}days, MaxVersions=${this.config.maxVersions}, KeepLatest=${this.config.keepLatest}`);
    console.log(`Mode: ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('');

    // Get all datasets with preparation jobs
    const datasets = await prisma.dataset.findMany({
      where: {
        preparationJobs: {
          some: {
            status: 'completed',
          },
        },
      },
      select: { id: true },
    });

    console.log(`Found ${datasets.length} datasets with completed preparation jobs`);

    let totalArtifactsDeleted = 0;
    let totalBytesFreed = 0;
    const allErrors: string[] = [];

    for (const dataset of datasets) {
      const result = await this.cleanupDataset(dataset.id);
      totalArtifactsDeleted += result.artifactsDeleted;
      totalBytesFreed += result.bytesFreed;
      allErrors.push(...result.errors);
    }

    console.log('\n=== Cleanup Summary ===');
    console.log(`Datasets processed: ${datasets.length}`);
    console.log(`Artifacts deleted: ${totalArtifactsDeleted}`);
    console.log(`Bytes freed: ${(totalBytesFreed / 1024 / 1024).toFixed(2)} MB`);
    
    if (allErrors.length > 0) {
      console.log(`Errors: ${allErrors.length}`);
      allErrors.forEach(e => console.log(`  - ${e}`));
    }

    return {
      totalDatasets: datasets.length,
      totalArtifactsDeleted,
      totalBytesFreed,
      errors: allErrors,
    };
  }
}

// Run if called directly
if (require.main === module) {
  const job = new ArtifactCleanupJob();
  job.run()
    .then(() => {
      console.log('\nCleanup job completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Cleanup job failed:', error);
      process.exit(1);
    });
}

export { ArtifactCleanupJob, CleanupConfig, CleanupResult };
