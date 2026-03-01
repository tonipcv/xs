/**
 * S3 Backup System
 * Automated database and file backups to S3
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

export interface BackupConfig {
  s3Bucket: string;
  s3Region: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  backupPrefix: string;
  retentionDays: number;
  compressionEnabled: boolean;
}

export interface BackupMetadata {
  id: string;
  type: 'full' | 'incremental' | 'files';
  timestamp: Date;
  size: number;
  compressed: boolean;
  s3Key: string;
  checksum?: string;
}

/**
 * S3 Backup Manager
 */
export class S3BackupManager {
  private s3Client: S3Client;
  private config: BackupConfig;

  constructor(config: BackupConfig) {
    this.config = config;
    this.s3Client = new S3Client({
      region: config.s3Region,
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
    });
  }

  /**
   * Create full database backup
   */
  public async createDatabaseBackup(): Promise<BackupMetadata> {
    const timestamp = new Date();
    const backupId = `db-${timestamp.toISOString().replace(/[:.]/g, '-')}`;
    const tempFile = `/tmp/${backupId}.sql`;
    const compressedFile = `${tempFile}.gz`;

    try {
      console.log('Creating database backup...');

      // Export database using pg_dump
      const databaseUrl = process.env.DATABASE_URL!;
      await execAsync(`pg_dump ${databaseUrl} > ${tempFile}`);

      let finalFile = tempFile;
      let compressed = false;

      // Compress if enabled
      if (this.config.compressionEnabled) {
        console.log('Compressing backup...');
        await this.compressFile(tempFile, compressedFile);
        finalFile = compressedFile;
        compressed = true;
      }

      // Get file size
      const stats = await fs.stat(finalFile);
      const size = stats.size;

      // Upload to S3
      const s3Key = `${this.config.backupPrefix}/database/${backupId}${compressed ? '.sql.gz' : '.sql'}`;
      console.log(`Uploading to S3: ${s3Key}`);

      const fileContent = await fs.readFile(finalFile);
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: compressed ? 'application/gzip' : 'application/sql',
        Metadata: {
          backupId,
          timestamp: timestamp.toISOString(),
          type: 'full',
          compressed: compressed.toString(),
        },
      }));

      // Cleanup temp files
      await fs.unlink(tempFile).catch(() => {});
      if (compressed) {
        await fs.unlink(compressedFile).catch(() => {});
      }

      // Store metadata in database
      await prisma.auditLog.create({
        data: {
          action: 'BACKUP_CREATED',
          resourceType: 'backup',
          resourceId: backupId,
          metadata: JSON.stringify({
            type: 'database',
            size,
            compressed,
            s3Key,
          }),
          status: 'SUCCESS',
          timestamp,
        },
      });

      console.log('Database backup completed successfully');

      return {
        id: backupId,
        type: 'full',
        timestamp,
        size,
        compressed,
        s3Key,
      };
    } catch (error) {
      console.error('Error creating database backup:', error);
      throw error;
    }
  }

  /**
   * Create files backup
   */
  public async createFilesBackup(sourcePath: string): Promise<BackupMetadata> {
    const timestamp = new Date();
    const backupId = `files-${timestamp.toISOString().replace(/[:.]/g, '-')}`;
    const tempFile = `/tmp/${backupId}.tar`;
    const compressedFile = `${tempFile}.gz`;

    try {
      console.log('Creating files backup...');

      // Create tar archive
      await execAsync(`tar -cf ${tempFile} -C ${path.dirname(sourcePath)} ${path.basename(sourcePath)}`);

      let finalFile = tempFile;
      let compressed = false;

      // Compress if enabled
      if (this.config.compressionEnabled) {
        console.log('Compressing backup...');
        await this.compressFile(tempFile, compressedFile);
        finalFile = compressedFile;
        compressed = true;
      }

      // Get file size
      const stats = await fs.stat(finalFile);
      const size = stats.size;

      // Upload to S3
      const s3Key = `${this.config.backupPrefix}/files/${backupId}${compressed ? '.tar.gz' : '.tar'}`;
      console.log(`Uploading to S3: ${s3Key}`);

      const fileContent = await fs.readFile(finalFile);
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: compressed ? 'application/gzip' : 'application/x-tar',
        Metadata: {
          backupId,
          timestamp: timestamp.toISOString(),
          type: 'files',
          compressed: compressed.toString(),
          sourcePath,
        },
      }));

      // Cleanup temp files
      await fs.unlink(tempFile).catch(() => {});
      if (compressed) {
        await fs.unlink(compressedFile).catch(() => {});
      }

      // Store metadata in database
      await prisma.auditLog.create({
        data: {
          action: 'BACKUP_CREATED',
          resourceType: 'backup',
          resourceId: backupId,
          metadata: JSON.stringify({
            type: 'files',
            size,
            compressed,
            s3Key,
            sourcePath,
          }),
          status: 'SUCCESS',
          timestamp,
        },
      });

      console.log('Files backup completed successfully');

      return {
        id: backupId,
        type: 'files',
        timestamp,
        size,
        compressed,
        s3Key,
      };
    } catch (error) {
      console.error('Error creating files backup:', error);
      throw error;
    }
  }

  /**
   * List available backups
   */
  public async listBackups(type?: 'database' | 'files'): Promise<BackupMetadata[]> {
    try {
      const prefix = type 
        ? `${this.config.backupPrefix}/${type}/`
        : `${this.config.backupPrefix}/`;

      const response = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        Prefix: prefix,
      }));

      if (!response.Contents) {
        return [];
      }

      const backups: BackupMetadata[] = [];

      for (const object of response.Contents) {
        if (!object.Key || !object.Size || !object.LastModified) continue;

        const backupType = object.Key.includes('/database/') ? 'full' : 'files';
        const compressed = object.Key.endsWith('.gz');

        backups.push({
          id: path.basename(object.Key),
          type: backupType as 'full' | 'files',
          timestamp: object.LastModified,
          size: object.Size,
          compressed,
          s3Key: object.Key,
        });
      }

      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.error('Error listing backups:', error);
      throw error;
    }
  }

  /**
   * Restore database from backup
   */
  public async restoreDatabase(backupId: string): Promise<void> {
    try {
      console.log(`Restoring database from backup: ${backupId}`);

      // Find backup in S3
      const backups = await this.listBackups('database');
      const backup = backups.find(b => b.id.includes(backupId));

      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Download from S3
      const tempFile = `/tmp/${backupId}`;
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: backup.s3Key,
      }));

      if (!response.Body) {
        throw new Error('Empty backup file');
      }

      // Save to temp file
      const fileStream = createWriteStream(tempFile);
      await pipeline(response.Body as any, fileStream);

      // Decompress if needed
      let sqlFile = tempFile;
      if (backup.compressed) {
        console.log('Decompressing backup...');
        const decompressedFile = tempFile.replace('.gz', '');
        await this.decompressFile(tempFile, decompressedFile);
        sqlFile = decompressedFile;
      }

      // Restore database
      const databaseUrl = process.env.DATABASE_URL!;
      console.log('Restoring database...');
      await execAsync(`psql ${databaseUrl} < ${sqlFile}`);

      // Cleanup
      await fs.unlink(tempFile).catch(() => {});
      if (backup.compressed) {
        await fs.unlink(sqlFile).catch(() => {});
      }

      // Log restoration
      await prisma.auditLog.create({
        data: {
          action: 'BACKUP_RESTORED',
          resourceType: 'backup',
          resourceId: backupId,
          metadata: JSON.stringify({
            s3Key: backup.s3Key,
          }),
          status: 'SUCCESS',
          timestamp: new Date(),
        },
      });

      console.log('Database restored successfully');
    } catch (error) {
      console.error('Error restoring database:', error);
      throw error;
    }
  }

  /**
   * Delete old backups based on retention policy
   */
  public async cleanupOldBackups(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const backups = await this.listBackups();
      let deletedCount = 0;

      for (const backup of backups) {
        if (backup.timestamp < cutoffDate) {
          console.log(`Deleting old backup: ${backup.id}`);
          
          await this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.config.s3Bucket,
            Key: backup.s3Key,
          }));

          deletedCount++;
        }
      }

      console.log(`Cleaned up ${deletedCount} old backups`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up backups:', error);
      throw error;
    }
  }

  /**
   * Compress file using gzip
   */
  private async compressFile(inputFile: string, outputFile: string): Promise<void> {
    const input = createReadStream(inputFile);
    const output = createWriteStream(outputFile);
    const gzip = createGzip({ level: 9 });

    await pipeline(input, gzip, output);
  }

  /**
   * Decompress gzip file
   */
  private async decompressFile(inputFile: string, outputFile: string): Promise<void> {
    await execAsync(`gunzip -c ${inputFile} > ${outputFile}`);
  }

  /**
   * Get backup statistics
   */
  public async getStats() {
    const backups = await this.listBackups();
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
    const dbBackups = backups.filter(b => b.type === 'full');
    const fileBackups = backups.filter(b => b.type === 'files');

    return {
      totalBackups: backups.length,
      databaseBackups: dbBackups.length,
      fileBackups: fileBackups.length,
      totalSize,
      oldestBackup: backups[backups.length - 1]?.timestamp,
      newestBackup: backups[0]?.timestamp,
      retentionDays: this.config.retentionDays,
    };
  }
}

/**
 * Create backup manager instance
 */
export function createBackupManager(): S3BackupManager {
  const config: BackupConfig = {
    s3Bucket: process.env.S3_BACKUP_BUCKET || 'xase-backups',
    s3Region: process.env.S3_BACKUP_REGION || 'us-west-2',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    backupPrefix: process.env.BACKUP_PREFIX || 'xase-sheets',
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
    compressionEnabled: process.env.BACKUP_COMPRESSION !== 'false',
  };

  return new S3BackupManager(config);
}

/**
 * Schedule automated backups
 */
export function scheduleAutomatedBackups(manager: S3BackupManager, intervalHours: number = 24) {
  console.log(`Scheduling automated backups every ${intervalHours} hours`);

  // Run immediately
  runBackup(manager);

  // Schedule periodic backups
  setInterval(() => {
    runBackup(manager);
  }, intervalHours * 60 * 60 * 1000);
}

/**
 * Run backup and cleanup
 */
async function runBackup(manager: S3BackupManager) {
  try {
    console.log('Starting automated backup...');
    
    // Create database backup
    await manager.createDatabaseBackup();
    
    // Cleanup old backups
    await manager.cleanupOldBackups();
    
    console.log('Automated backup completed');
  } catch (error) {
    console.error('Error in automated backup:', error);
  }
}
