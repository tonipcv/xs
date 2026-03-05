import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';

export class SignedUrlGenerator {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
    this.bucket = process.env.S3_BUCKET ?? 'xase-datasets';
  }

  async generateUrls(filePaths: string[], leaseId: string): Promise<string[]> {
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
}
