import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { prisma } from '@/lib/prisma';
import { DataPreparer } from '@/lib/preparation/data-preparer';
import { PreparationRequest, PreparationJob } from '@/lib/preparation/preparation.types';
import { z } from 'zod';

const preparationRequestSchema = z.object({
  leaseId: z.string(),
  task: z.enum(['pre-training', 'fine-tuning', 'dpo', 'rag', 'eval']),
  modality: z.enum(['text', 'image', 'audio', 'multimodal']),
  target: z.object({
    runtime: z.string(),
    format: z.string(),
  }),
  config: z.record(z.unknown()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { datasetId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dataset = await prisma.dataset.findFirst({
      where: {
        id: params.datasetId,
        tenantId,
      },
    });

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    const body = await request.json();
    const validatedRequest = preparationRequestSchema.parse(body) as any as PreparationRequest;

    const lease = await prisma.accessLease.findFirst({
      where: {
        id: validatedRequest.leaseId,
        datasetId: dataset.id,
        status: 'ACTIVE',
      },
    });

    if (!lease) {
      return NextResponse.json({ error: 'Invalid or inactive lease' }, { status: 403 });
    }

    const preparationJob = await prisma.preparationJob.create({
      data: {
        datasetId: dataset.id,
        tenantId,
        leaseId: validatedRequest.leaseId,
        task: validatedRequest.task,
        modality: validatedRequest.modality,
        runtime: validatedRequest.target.runtime,
        format: validatedRequest.target.format,
        config: JSON.stringify(validatedRequest.config ?? {}),
        status: 'pending',
        progress: 0,
      },
    });

    const preparer = new DataPreparer();
    const job: PreparationJob = {
      id: preparationJob.id,
      datasetId: dataset.id,
      tenantId,
      request: validatedRequest,
      startTime: Date.now(),
      status: 'pending',
      progress: 0,
      createdAt: preparationJob.createdAt,
      updatedAt: preparationJob.updatedAt,
    };

    setImmediate(async () => {
      try {
        const result = await preparer.prepare(job);

        await prisma.preparationJob.update({
          where: { id: preparationJob.id },
          data: {
            status: 'completed',
            progress: 100,
            outputPath: result.delivery.manifestPath,
            manifestUrl: result.delivery.downloadUrls[0],
            completedAt: new Date(),
          },
        });
      } catch (error) {
        console.error('Preparation job failed:', error);
        await prisma.preparationJob.update({
          where: { id: preparationJob.id },
          data: {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    });

    return NextResponse.json({
      jobId: preparationJob.id,
      status: 'pending',
      message: 'Preparation job started',
    });
  } catch (error) {
    console.error('Error creating preparation job:', error);
    return NextResponse.json(
      { error: 'Failed to create preparation job' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { datasetId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId2 = (session?.user as any)?.tenantId as string | undefined;
    if (!tenantId2) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobs = await prisma.preparationJob.findMany({
      where: {
        datasetId: params.datasetId,
        tenantId: tenantId2,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Error fetching preparation jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preparation jobs' },
      { status: 500 }
    );
  }
}
