import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const cancelRequestSchema = z.object({
  reason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;

    const body = await request.json();
    const { reason } = cancelRequestSchema.parse(body);

    const job = await prisma.preparationJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json(
        { error: `Cannot cancel job with status: ${job.status}` },
        { status: 400 }
      );
    }

    if (job.status === 'cancelled') {
      return NextResponse.json(
        { message: 'Job already cancelled' },
        { status: 200 }
      );
    }

    const updatedJob = await prisma.preparationJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        error: reason || 'Job cancelled by user',
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      id: updatedJob.id,
      status: updatedJob.status,
      message: 'Job cancelled successfully',
      cancelledAt: updatedJob.updatedAt,
    });
  } catch (error) {
    console.error('Error cancelling job:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
