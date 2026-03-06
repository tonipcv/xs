import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      preparationJob: {
        update: vi.fn(),
      },
    },
  };
});

import { DataPreparer } from '@/lib/preparation/data-preparer';
import { prisma } from '@/lib/prisma';
import { DeliveryResult } from '@/lib/preparation/preparation.types';

describe('DataPreparer - delivery metadata persistence', () => {
  let preparer: DataPreparer;
  const prismaUpdateMock = prisma.preparationJob.update as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    preparer = new DataPreparer();
    prismaUpdateMock.mockReset();
  });

  afterEach(() => {
    prismaUpdateMock.mockReset();
  });

  it('should persist manifest/checksum/readme paths and download URLs', async () => {
    const delivery: DeliveryResult = {
      manifestPath: '/tmp/prepared/job123/manifest.json',
      checksumPath: '/tmp/prepared/job123/checksums.txt',
      readmePath: '/tmp/prepared/job123/README.md',
      downloadUrls: ['https://downloads.stub/prepared/lease1/shard-000.jsonl'],
      expiresAt: new Date('2026-03-05T10:00:00Z'),
    };

    prismaUpdateMock.mockResolvedValue({} as any);

    await (preparer as any).persistDeliveryMetadata('job123', delivery);

    expect(prismaUpdateMock).toHaveBeenCalledWith({
      where: { id: 'job123' },
      data: {
        manifestPath: delivery.manifestPath,
        checksumPath: delivery.checksumPath,
        readmePath: delivery.readmePath,
        downloadUrls: delivery.downloadUrls,
        deliveryExpiresAt: delivery.expiresAt,
      },
    });
  });
});
