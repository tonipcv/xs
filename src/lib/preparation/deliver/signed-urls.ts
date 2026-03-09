import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';

type SignedUrlMode = 's3' | 'stub';

export interface SignedUrlInfo {
  url: string;
  key: string;
  expiresAt: Date;
}

export class SignedUrlGenerator {
  private s3Client?: S3Client;
  private bucket: string;
  private mode: SignedUrlMode;
  private activeUrls: Map<string, SignedUrlInfo[]> = new Map(); // leaseId -> URLs

  constructor(options?: { mode?: SignedUrlMode; bucket?: string }) {
    this.mode =
      options?.mode ?? (process.env.PREPARATION_SIGNED_URL_MODE === 'stub' ? 'stub' : 's3');
    this.bucket = options?.bucket ?? process.env.S3_BUCKET ?? 'xase-datasets';

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (this.mode === 's3' && accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION ?? 'us-east-1',
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.mode = 'stub';
    }
  }

  async generateUrls(filePaths: string[], leaseId: string): Promise<string[]> {
    if (this.mode === 'stub' || !this.s3Client) {
      return this.generateStubUrls(filePaths, leaseId);
    }

    const urls: string[] = [];
    const urlInfos: SignedUrlInfo[] = [];

    for (const filePath of filePaths) {
      const key = `prepared/${leaseId}/${path.basename(filePath)}`;
      const content = await fs.readFile(filePath);

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: content,
        })
      );

      const expiresInSeconds = 7 * 24 * 60 * 60; // 7 days
      const url = await getSignedUrl(
        this.s3Client,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { expiresIn: expiresInSeconds }
      );

      urls.push(url);
      urlInfos.push({
        url,
        key,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      });
    }

    // Track active URLs for this lease
    this.activeUrls.set(leaseId, urlInfos);

    return urls;
  }

  /**
   * Revoke all signed URLs for a lease by deleting the S3 objects
   * This effectively makes the URLs invalid
   */
  async revokeUrls(leaseId: string): Promise<boolean> {
    if (this.mode === 'stub' || !this.s3Client) {
      // In stub mode, just remove from tracking
      this.activeUrls.delete(leaseId);
      return true;
    }

    const urlInfos = this.activeUrls.get(leaseId);
    if (!urlInfos || urlInfos.length === 0) {
      return true; // Nothing to revoke
    }

    try {
      // Delete all S3 objects for this lease
      await Promise.all(
        urlInfos.map(async (info) => {
          await this.s3Client!.send(
            new DeleteObjectCommand({
              Bucket: this.bucket,
              Key: info.key,
            })
          );
        })
      );

      // Remove from tracking
      this.activeUrls.delete(leaseId);

      return true;
    } catch (error) {
      console.error(`Failed to revoke URLs for lease ${leaseId}:`, error);
      return false;
    }
  }

  /**
   * Check if a lease has active signed URLs
   */
  hasActiveUrls(leaseId: string): boolean {
    const urls = this.activeUrls.get(leaseId);
    if (!urls) return false;
    
    // Check if any URLs are still valid (not expired)
    const now = new Date();
    return urls.some((info) => info.expiresAt > now);
  }

  /**
   * Get active URL info for a lease
   */
  getActiveUrls(leaseId: string): SignedUrlInfo[] {
    return this.activeUrls.get(leaseId) ?? [];
  }

  private async generateStubUrls(filePaths: string[], leaseId: string): Promise<string[]> {
    await Promise.all(
      filePaths.map(async (filePath) => {
        await fs.access(filePath).catch(() => fs.writeFile(filePath, ''));
      })
    );

    const urls = filePaths.map((filePath) => {
      const key = `prepared/${leaseId}/${path.basename(filePath)}`;
      return `https://downloads.stub/${key}`;
    });

    // Track stub URLs too
    this.activeUrls.set(
      leaseId,
      urls.map((url) => ({
        url,
        key: `prepared/${leaseId}/${path.basename(url)}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }))
    );

    return urls;
  }
}
