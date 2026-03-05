import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export class S3Fetcher {
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

  async fetchFile(fileKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error(`No data returned for key: ${fileKey}`);
    }

    return this.streamToBuffer(response.Body as Readable);
  }

  async fetchFileAsString(fileKey: string): Promise<string> {
    const buffer = await this.fetchFile(fileKey);
    return buffer.toString('utf-8');
  }

  async fetchFileAsJson<T = unknown>(fileKey: string): Promise<T> {
    const content = await this.fetchFileAsString(fileKey);
    return JSON.parse(content) as T;
  }

  async fetchMultipleFiles(fileKeys: string[]): Promise<Map<string, Buffer>> {
    const results = new Map<string, Buffer>();

    await Promise.all(
      fileKeys.map(async (key) => {
        const data = await this.fetchFile(key);
        results.set(key, data);
      })
    );

    return results;
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
