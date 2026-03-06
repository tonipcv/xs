import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
    }

    const job = await prisma.preparationJob.findFirst({
      where: {
        id: params.jobId,
        tenantId: user.tenantId,
      },
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
            datasetId: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      datasetId: job.datasetId,
      dataset: job.dataset,
      task: job.task,
      modality: job.modality,
      runtime: job.runtime,
      format: job.format,
      status: job.status,
      progress: job.progress,
      outputPath: job.outputPath,
      manifestUrl: job.manifestUrl,
      manifestPath: job.manifestPath,
      checksumPath: job.checksumPath,
      readmePath: job.readmePath,
      downloadUrls: job.downloadUrls,
      deliveryExpiresAt: job.deliveryExpiresAt,
      normalizationResult: job.normalizationResult,
      compilationResult: job.compilationResult,
      deliveryResult: job.deliveryResult,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    });

  } catch (error) {
    console.error('Get job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
