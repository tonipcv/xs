import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { prisma } from '@/lib/prisma';
import { idempotencyManager } from '@/lib/preparation/idempotency/idempotency-manager';
import { rateLimiter } from '@/lib/preparation/rate-limiting/rate-limiter';
import { createJobQueue } from '@/lib/preparation/job-queue';
import { PreparationRequest } from '@/lib/preparation/preparation.types';
import { z } from 'zod';

const preparationRequestSchema = z.object({
  leaseId: z.string(),
  version: z.string().default('1.0'),
  task: z.enum(['pre-training', 'fine-tuning', 'dpo', 'rag', 'eval']),
  modality: z.enum(['text', 'image', 'audio', 'multimodal']),
  target: z.object({
    runtime: z.enum(['hf', 'openai', 'megatron', 'mosaic', 'trl', 'pytorch', 'generic']),
    format: z.enum(['jsonl', 'parquet', 'bin', 'mds', 'webdataset']),
  }),
  config: z
    .object({
      quality_threshold: z.number().min(0).max(1).optional(),
      deduplicate: z.boolean().optional(),
      deid: z.boolean().optional(),
      max_tokens: z.number().int().positive().optional(),
      seed: z.number().int().optional(),
      chunk_size: z.number().int().positive().optional(),
      chunk_overlap: z.number().int().nonnegative().optional(),
      template: z.enum(['chatml', 'alpaca', 'sharegpt']).optional(),
      split_ratios: z
        .object({
          train: z.number().min(0),
          val: z.number().min(0),
          test: z.number().min(0),
        })
        .refine((val) => Math.abs(val.train + val.val + val.test - 1) < 0.0001, {
          message: 'split ratios must sum to 1',
        })
        .optional(),
      shard_size_mb: z.number().int().positive().optional(),
    })
    .optional(),
  license: z.object({
    type: z.string(),
    attribution: z.string().optional(),
    restrictions: z.array(z.string()).optional(),
  }),
  privacy: z.object({
    piiHandling: z.enum(['drop', 'mask', 'retain']),
    patientTokenization: z.enum(['none', 'hmac-sha256']).optional(),
    retentionHours: z.number().int().positive().optional(),
    auditLogRequired: z.boolean().optional(),
  }),
  output: z.object({
    layout: z.string().default('prepared/{datasetId}/{jobId}'),
    manifestFile: z.string().default('manifest.json'),
    readmeFile: z.string().default('README.md'),
    checksumFile: z.string().default('checksums.txt'),
    checksumAlgorithm: z.literal('sha256').default('sha256'),
  }),
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

    // Rate limiting check
    const rateLimitCheck = await rateLimiter.checkRateLimit(tenantId);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded', 
          reason: rateLimitCheck.reason,
          retryAfter: rateLimitCheck.retryAfter 
        },
        { 
          status: 429,
          headers: rateLimitCheck.retryAfter 
            ? { 'Retry-After': String(rateLimitCheck.retryAfter) }
            : undefined
        }
      );
    }

    // Idempotency check
    const idempotencyKey = request.headers.get('Idempotency-Key');
    const body = await request.json();

    if (idempotencyKey) {
      const existing = await idempotencyManager.checkIdempotency(
        idempotencyKey,
        params.datasetId,
        tenantId,
        body
      );

      if (existing) {
        // Return cached response
        return NextResponse.json(existing.response, { status: 200 });
      }
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
        license: validatedRequest.license as any,
        privacy: validatedRequest.privacy as any,
        output: validatedRequest.output as any,
        status: 'pending',
        progress: 0,
      },
    });

    // Store idempotency record if key was provided
    if (idempotencyKey) {
      const response = {
        jobId: preparationJob.id,
        status: 'pending',
        message: 'Preparation job queued',
      };
      await idempotencyManager.storeIdempotency(
        idempotencyKey,
        params.datasetId,
        tenantId,
        body,
        preparationJob.id,
        response
      );
    }

    // Add job to BullMQ queue instead of using setImmediate
    const jobQueue = createJobQueue(process.env.REDIS_URL || 'redis://localhost:6379');
    await jobQueue.addJob({
      jobId: preparationJob.id,
      datasetId: dataset.id,
      request: validatedRequest,
      priority: 10,
    });

    return NextResponse.json({
      jobId: preparationJob.id,
      status: 'pending',
      message: 'Preparation job queued',
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
