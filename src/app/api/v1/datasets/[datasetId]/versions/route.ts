/**
 * API Routes for Dataset Version Management
 * 
 * GET /api/v1/datasets/:datasetId/versions - Lista todas as versões
 * GET /api/v1/datasets/:datasetId/versions/:version - Obtém versão específica
 * POST /api/v1/datasets/:datasetId/versions/:version/rollback - Rollback para versão
 * GET /api/v1/datasets/:datasetId/versions/compare - Compara duas versões
 * GET /api/v1/datasets/:datasetId/versions/changelog - Gera changelog
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVersionManager } from '@/lib/preparation/versioning/dataset-version-manager';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema para validação
const compareQuerySchema = z.object({
  from: z.string().transform(Number).pipe(z.number().positive()),
  to: z.string().transform(Number).pipe(z.number().positive()),
});

const changelogQuerySchema = z.object({
  from: z.string().transform(Number).optional(),
  to: z.string().transform(Number).optional(),
});

/**
 * GET /api/v1/datasets/:datasetId/versions
 * Lista todas as versões do dataset
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { datasetId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { datasetId } = params;

    // Verifica acesso ao dataset
    const dataset = await prisma.dataset.findFirst({
      where: {
        id: datasetId,
        tenantId,
      },
    });

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    // Determina ação baseada na query string
    const { searchParams } = new URL(request.url);
    
    if (searchParams.has('compare')) {
      // Comparação de versões
      const validation = compareQuerySchema.safeParse({
        from: searchParams.get('from'),
        to: searchParams.get('to'),
      });

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid query parameters', details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const versionManager = getVersionManager();
      const comparison = await versionManager.compareVersions(
        datasetId,
        validation.data.from,
        validation.data.to
      );

      return NextResponse.json({
        datasetId,
        comparison,
      });
    }

    if (searchParams.has('changelog')) {
      // Gera changelog
      const validation = changelogQuerySchema.safeParse({
        from: searchParams.get('from') || undefined,
        to: searchParams.get('to') || undefined,
      });

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid query parameters', details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const versionManager = getVersionManager();
      const changelog = await versionManager.generateChangelog(
        datasetId,
        validation.data.from,
        validation.data.to
      );

      return NextResponse.json({
        datasetId,
        changelog,
        format: 'markdown',
      });
    }

    // Lista todas as versões
    const versionManager = getVersionManager();
    const metadata = await versionManager.listVersions(datasetId);

    return NextResponse.json({
      datasetId,
      ...metadata,
    });
  } catch (error) {
    console.error('Error fetching versions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch versions' },
      { status: 500 }
    );
  }
}
