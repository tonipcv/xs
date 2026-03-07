import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getKillSwitch } from '@/lib/preparation/kill-switch';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/v1/datasets/:datasetId/prepare/:jobId/cancel
 * Cancel a running preparation job
 */
export async function POST(
  request: Request,
  { params }: { params: { datasetId: string; jobId: string } }
) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { datasetId, jobId } = params;

    // Parse request body for optional reason
    let reason = 'User requested cancellation';
    try {
      const body = await request.json();
      if (body.reason) {
        reason = body.reason;
      }
    } catch {
      // No body or invalid JSON, use default reason
    }

    // Verify job exists and belongs to this tenant/dataset
    const job = await prisma.preparationJob.findFirst({
      where: {
        id: jobId,
        datasetId,
        tenantId,
      },
      select: {
        id: true,
        status: true,
        progress: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if job can be cancelled
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return NextResponse.json(
        { 
          error: 'Job cannot be cancelled',
          currentStatus: job.status,
          message: `Job is already ${job.status}`
        },
        { status: 400 }
      );
    }

    // Request cancellation via kill switch
    const killSwitch = getKillSwitch();
    const cancelled = await killSwitch.requestCancellation(jobId, tenantId, reason);

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Failed to cancel job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      jobId,
      status: 'cancelled',
      message: 'Job cancellation requested',
      previousStatus: job.status,
      progress: job.progress,
      reason,
    });

  } catch (error) {
    console.error('Error cancelling job:', error);
    return NextResponse.json(
      { error: 'Failed to cancel job' },
      { status: 500 }
    );
  }
}
