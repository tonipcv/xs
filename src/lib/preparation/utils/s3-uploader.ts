import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile } from 'fs/promises';

export class S3Uploader {
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

  async uploadBuffer(key: string, buffer: Buffer, contentType: string = 'application/octet-stream'): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
    return `s3://${this.bucket}/${key}`;
  }

  async uploadFile(key: string, filePath: string, contentType?: string): Promise<string> {
    const buffer = await readFile(filePath);
    const detectedContentType = contentType || this.inferContentType(filePath);
    return this.uploadBuffer(key, buffer, detectedContentType);
  }

  async uploadString(key: string, content: string, contentType: string = 'text/plain'): Promise<string> {
    return this.uploadBuffer(key, Buffer.from(content, 'utf-8'), contentType);
  }

  async uploadJson(key: string, data: unknown): Promise<string> {
    const content = JSON.stringify(data, null, 2);
    return this.uploadString(key, content, 'application/json');
  }

  private inferContentType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      json: 'application/json',
      jsonl: 'application/jsonlines',
      csv: 'text/csv',
      parquet: 'application/octet-stream',
      md: 'text/markdown',
      txt: 'text/plain',
      gz: 'application/gzip',
      zip: 'application/zip',
    };
    return types[ext || ''] || 'application/octet-stream';
  }

  getBucket(): string {
    return this.bucket;
  }
}
