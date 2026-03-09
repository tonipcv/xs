import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PreparationQueue } from '@/lib/preparation/queue/preparation-queue';
import { z } from 'zod';

const prepareSchema = z.object({
  datasetId: z.string(),
  config: z.object({
    output_format: z.enum(['jsonl', 'parquet', 'csv']).default('jsonl'),
    quality_threshold: z.number().min(0).max(1).optional().default(0.8),
    chunk_size: z.number().optional().default(512),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    const body = await req.json();
    const validated = prepareSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.errors },
        { status: 400 }
      );
    }

    const { datasetId, config } = validated.data;

    // Check if dataset exists
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    // Create preparation job
    const job = await prisma.preparationJob.create({
      data: {
        tenantId: dataset.tenantId,
        datasetId,
        status: 'PENDING',
        config: JSON.stringify(config),
        progress: 0,
      },
    });

    // Add to queue
    const queue = new PreparationQueue();
    await queue.addJob({
      jobId: job.id,
      datasetId,
      config,
      tenantId: dataset.tenantId,
    });

    return NextResponse.json({
      jobId: job.id,
      status: 'PENDING',
      message: 'Preparation job created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating preparation job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
