import { prisma } from '@/lib/prisma';
import { S3Fetcher } from '../utils/s3-fetcher';

export interface DatasetRecord {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

export class DatasetAdapter {
  private s3Fetcher: S3Fetcher;

  constructor() {
    this.s3Fetcher = new S3Fetcher();
  }

  async getRecords(datasetId: string): Promise<DatasetRecord[]> {
    const assets = await prisma.dataAsset.findMany({
      where: { datasetId },
      select: {
        id: true,
        fileKey: true,
        metadata: true,
        dataType: true,
        language: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const records: DatasetRecord[] = [];

    for (const asset of assets) {
      try {
        const content = await this.s3Fetcher.fetchFileAsString(asset.fileKey);
        records.push({
          id: asset.id,
          content,
          metadata: {
            ...(asset.metadata as Record<string, unknown> || {}),
            dataType: asset.dataType,
            language: asset.language,
          },
        });
      } catch (error) {
        console.error(`Failed to fetch asset ${asset.id}:`, error);
      }
    }

    return records;
  }

  async getRecordsAsBuffers(datasetId: string): Promise<Array<{ id: string; data: Buffer; metadata: Record<string, unknown> }>> {
    const assets = await prisma.dataAsset.findMany({
      where: { datasetId },
      select: {
        id: true,
        fileKey: true,
        metadata: true,
        dataType: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const records: Array<{ id: string; data: Buffer; metadata: Record<string, unknown> }> = [];

    for (const asset of assets) {
      try {
        const data = await this.s3Fetcher.fetchFile(asset.fileKey);
        records.push({
          id: asset.id,
          data,
          metadata: {
            ...(asset.metadata as Record<string, unknown> || {}),
            dataType: asset.dataType,
          },
        });
      } catch (error) {
        console.error(`Failed to fetch asset ${asset.id}:`, error);
      }
    }

    return records;
  }

  async updateRecord(recordId: string, content: string): Promise<void> {
    const asset = await prisma.dataAsset.findUnique({
      where: { id: recordId },
      select: { fileKey: true },
    });

    if (!asset) {
      throw new Error(`Asset ${recordId} not found`);
    }

    const buffer = Buffer.from(content, 'utf-8');
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    
    const s3Client = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET ?? 'xase-datasets',
        Key: asset.fileKey,
        Body: buffer,
      })
    );
  }

  async getRecordCount(datasetId: string): Promise<number> {
    return prisma.dataAsset.count({
      where: { datasetId },
    });
  }
}
