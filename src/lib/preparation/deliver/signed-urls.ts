import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';

type SignedUrlMode = 's3' | 'stub';

export class SignedUrlGenerator {
  private s3Client?: S3Client;
  private bucket: string;
  private mode: SignedUrlMode;

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

      const url = await getSignedUrl(
        this.s3Client,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { expiresIn: 7 * 24 * 60 * 60 }
      );

      urls.push(url);
    }

    return urls;
  }

  private async generateStubUrls(filePaths: string[], leaseId: string): Promise<string[]> {
    await Promise.all(
      filePaths.map(async (filePath) => {
        await fs.access(filePath).catch(() => fs.writeFile(filePath, ''));
      })
    );

    return filePaths.map((filePath) => {
      const key = `prepared/${leaseId}/${path.basename(filePath)}`;
      return `https://downloads.stub/${key}`;
    });
  }
}
