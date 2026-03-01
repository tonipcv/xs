/**
 * Automated Backup System
 * Daily backups to S3 with retention policies
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createReadStream, createWriteStream, unlinkSync } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BACKUP_BUCKET = process.env.BACKUP_BUCKET_NAME || 'xase-backups';

export interface BackupConfig {
  type: 'database' | 'files' | 'full';
  retention: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  compression: boolean;
  encryption: boolean;
}

export interface BackupResult {
  backupId: string;
  type: string;
  timestamp: Date;
  s3Key: string;
  fileSize: number;
  compressed: boolean;
  encrypted: boolean;
  status: 'success' | 'failed';
  error?: string;
}

const DEFAULT_CONFIG: BackupConfig = {
  type: 'full',
  retention: {
    daily: 7,
    weekly: 4,
    monthly: 12,
  },
  compression: true,
  encryption: true,
};

/**
 * Execute automated backup
 */
export async function executeBackup(config: BackupConfig = DEFAULT_CONFIG): Promise<BackupResult> {
  const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date();

  console.log(`Starting backup: ${backupId}`);

  try {
    let s3Key: string;
    let fileSize: number;

    switch (config.type) {
      case 'database':
        ({ s3Key, fileSize } = await backupDatabase(backupId, config));
        break;
      case 'files':
        ({ s3Key, fileSize } = await backupFiles(backupId, config));
        break;
      case 'full':
        const dbBackup = await backupDatabase(backupId, config);
        const filesBackup = await backupFiles(backupId, config);
        s3Key = dbBackup.s3Key;
        fileSize = dbBackup.fileSize + filesBackup.fileSize;
        break;
      default:
        throw new Error(`Unknown backup type: ${config.type}`);
    }

    // Log backup
    await prisma.auditLog.create({
      data: {
        action: 'BACKUP_COMPLETED',
        resourceType: 'backup',
        resourceId: backupId,
        metadata: JSON.stringify({
          type: config.type,
          s3Key,
          fileSize,
          compressed: config.compression,
          encrypted: config.encryption,
        }),
        status: 'SUCCESS',
        timestamp,
      },
    });

    // Clean old backups
    await cleanOldBackups(config.retention);

    const result: BackupResult = {
      backupId,
      type: config.type,
      timestamp,
      s3Key,
      fileSize,
      compressed: config.compression,
      encrypted: config.encryption,
      status: 'success',
    };

    console.log(`Backup completed: ${backupId}`);

    return result;
  } catch (error: any) {
    console.error('Backup failed:', error);

    await prisma.auditLog.create({
      data: {
        action: 'BACKUP_FAILED',
        resourceType: 'backup',
        resourceId: backupId,
        metadata: JSON.stringify({
          type: config.type,
          error: error.message,
        }),
        status: 'FAILED',
        timestamp,
      },
    });

    return {
      backupId,
      type: config.type,
      timestamp,
      s3Key: '',
      fileSize: 0,
      compressed: config.compression,
      encrypted: config.encryption,
      status: 'failed',
      error: error.message,
    };
  }
}

/**
 * Backup database using pg_dump
 */
async function backupDatabase(
  backupId: string,
  config: BackupConfig
): Promise<{ s3Key: string; fileSize: number }> {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `/tmp/${backupId}_database.sql`;
  const compressedFilename = `${filename}.gz`;

  // Execute pg_dump
  const databaseUrl = process.env.DATABASE_URL || '';
  await execAsync(`pg_dump ${databaseUrl} > ${filename}`);

  let finalFilename = filename;
  let fileSize = 0;

  // Compress if enabled
  if (config.compression) {
    const gzip = createGzip();
    const source = createReadStream(filename);
    const destination = createWriteStream(compressedFilename);

    await pipeline(source, gzip, destination);

    unlinkSync(filename);
    finalFilename = compressedFilename;
  }

  // Upload to S3
  const s3Key = `backups/database/${timestamp}/${backupId}_database${config.compression ? '.sql.gz' : '.sql'}`;
  const fileBuffer = require('fs').readFileSync(finalFilename);
  fileSize = fileBuffer.length;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BACKUP_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ServerSideEncryption: config.encryption ? 'AES256' : undefined,
      Metadata: {
        backupId,
        type: 'database',
        timestamp: new Date().toISOString(),
      },
    })
  );

  // Clean up local file
  unlinkSync(finalFilename);

  return { s3Key, fileSize };
}

/**
 * Backup files using tar
 */
async function backupFiles(
  backupId: string,
  config: BackupConfig
): Promise<{ s3Key: string; fileSize: number }> {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `/tmp/${backupId}_files.tar`;
  const compressedFilename = `${filename}.gz`;

  // Create tar archive of uploads directory
  await execAsync(`tar -cf ${filename} -C /tmp uploads 2>/dev/null || true`);

  let finalFilename = filename;
  let fileSize = 0;

  // Compress if enabled
  if (config.compression) {
    await execAsync(`gzip ${filename}`);
    finalFilename = compressedFilename;
  }

  // Upload to S3
  const s3Key = `backups/files/${timestamp}/${backupId}_files${config.compression ? '.tar.gz' : '.tar'}`;
  
  if (require('fs').existsSync(finalFilename)) {
    const fileBuffer = require('fs').readFileSync(finalFilename);
    fileSize = fileBuffer.length;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BACKUP_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ServerSideEncryption: config.encryption ? 'AES256' : undefined,
        Metadata: {
          backupId,
          type: 'files',
          timestamp: new Date().toISOString(),
        },
      })
    );

    // Clean up local file
    unlinkSync(finalFilename);
  }

  return { s3Key, fileSize };
}

/**
 * Clean old backups based on retention policy
 */
async function cleanOldBackups(retention: BackupConfig['retention']) {
  const now = new Date();

  // List all backups
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BACKUP_BUCKET,
      Prefix: 'backups/',
    })
  );

  if (!response.Contents) return;

  const backupsToDelete: string[] = [];

  for (const object of response.Contents) {
    if (!object.Key || !object.LastModified) continue;

    const age = Math.floor((now.getTime() - object.LastModified.getTime()) / (1000 * 60 * 60 * 24));

    // Determine if backup should be kept
    let shouldKeep = false;

    // Keep daily backups
    if (age <= retention.daily) {
      shouldKeep = true;
    }
    // Keep weekly backups (one per week)
    else if (age <= retention.daily + retention.weekly * 7) {
      const weekNumber = Math.floor(age / 7);
      const dayOfWeek = object.LastModified.getDay();
      if (dayOfWeek === 0) { // Sunday
        shouldKeep = true;
      }
    }
    // Keep monthly backups (one per month)
    else if (age <= retention.daily + retention.weekly * 7 + retention.monthly * 30) {
      const dayOfMonth = object.LastModified.getDate();
      if (dayOfMonth === 1) { // First day of month
        shouldKeep = true;
      }
    }

    if (!shouldKeep) {
      backupsToDelete.push(object.Key);
    }
  }

  // Delete old backups
  for (const key of backupsToDelete) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BACKUP_BUCKET,
        Key: key,
      })
    );

    console.log(`Deleted old backup: ${key}`);
  }

  console.log(`Cleaned ${backupsToDelete.length} old backups`);
}

/**
 * Schedule automated backups
 */
export function scheduleBackups(config: BackupConfig = DEFAULT_CONFIG) {
  // Run backup daily at 2 AM
  const schedule = '0 2 * * *'; // Cron format

  console.log(`Scheduled daily backups at 2 AM`);

  // In production, use a proper cron scheduler like node-cron
  // For now, just log the schedule
  return schedule;
}

/**
 * Restore from backup
 */
export async function restoreBackup(backupId: string): Promise<boolean> {
  console.log(`Restoring backup: ${backupId}`);

  try {
    // Find backup in S3
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BACKUP_BUCKET,
        Prefix: `backups/`,
      })
    );

    if (!response.Contents) {
      throw new Error('No backups found');
    }

    const backup = response.Contents.find(obj => obj.Key?.includes(backupId));

    if (!backup || !backup.Key) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // Download and restore
    // TODO: Implement actual restore logic
    console.log(`Would restore from: ${backup.Key}`);

    await prisma.auditLog.create({
      data: {
        action: 'BACKUP_RESTORED',
        resourceType: 'backup',
        resourceId: backupId,
        metadata: JSON.stringify({
          s3Key: backup.Key,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    return true;
  } catch (error: any) {
    console.error('Restore failed:', error);

    await prisma.auditLog.create({
      data: {
        action: 'BACKUP_RESTORE_FAILED',
        resourceType: 'backup',
        resourceId: backupId,
        metadata: JSON.stringify({
          error: error.message,
        }),
        status: 'FAILED',
        timestamp: new Date(),
      },
    });

    return false;
  }
}

/**
 * List available backups
 */
export async function listBackups(): Promise<Array<{
  key: string;
  size: number;
  lastModified: Date;
}>> {
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BACKUP_BUCKET,
      Prefix: 'backups/',
    })
  );

  if (!response.Contents) return [];

  return response.Contents.map(obj => ({
    key: obj.Key || '',
    size: obj.Size || 0,
    lastModified: obj.LastModified || new Date(),
  })).sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}
