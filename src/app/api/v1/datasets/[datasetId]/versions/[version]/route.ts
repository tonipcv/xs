/**
 * API Routes for Specific Dataset Version Operations
 * 
 * GET /api/v1/datasets/:datasetId/versions/:version - Obtém versão específica
 * POST /api/v1/datasets/:datasetId/versions/:version/rollback - Rollback para versão
 * GET /api/v1/datasets/:datasetId/versions/:version/verify - Verifica integridade
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVersionManager } from '@/lib/preparation/versioning/dataset-version-manager';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema para validação do número de versão
const versionParamSchema = z.object({
  version: z.string().transform(Number).pipe(z.number().positive()),
});

/**
 * GET /api/v1/datasets/:datasetId/versions/:version
 * Obtém detalhes de uma versão específica
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { datasetId: string; version: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { datasetId, version: versionStr } = params;

    // Valida versão
    const validation = versionParamSchema.safeParse({ version: versionStr });
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid version number' },
        { status: 400 }
      );
    }

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

    const versionManager = getVersionManager();

    // Verifica se é uma requisição de verify
    const { searchParams } = new URL(request.url);
    if (searchParams.has('verify')) {
      const integrity = await versionManager.verifyVersionIntegrity(
        datasetId,
        validation.data.version
      );

      return NextResponse.json({
        datasetId,
        version: validation.data.version,
        integrity,
      });
    }

    // Obtém versão específica
    const version = await versionManager.getVersion(datasetId, validation.data.version);

    if (!version) {
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      datasetId,
      version: version,
    });
  } catch (error) {
    console.error('Error fetching version:', error);
    return NextResponse.json(
      { error: 'Failed to fetch version' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/datasets/:datasetId/versions/:version/rollback
 * Realiza rollback para uma versão anterior
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { datasetId: string; version: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    const userId = (session?.user as any)?.id as string | undefined;
    
    if (!tenantId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { datasetId, version: versionStr } = params;

    // Valida versão
    const validation = versionParamSchema.safeParse({ version: versionStr });
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid version number' },
        { status: 400 }
      );
    }

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

    // Verifica se é uma operação de rollback
    const { searchParams } = new URL(request.url);
    if (!searchParams.has('rollback')) {
      return NextResponse.json(
        { error: 'Invalid operation. Use ?rollback=true' },
        { status: 400 }
      );
    }

    const versionManager = getVersionManager();
    const result = await versionManager.rollbackToVersion(
      datasetId,
      validation.data.version,
      userId
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      datasetId,
      targetVersion: validation.data.version,
      message: result.message,
      success: true,
    });
  } catch (error) {
    console.error('Error performing rollback:', error);
    return NextResponse.json(
      { error: 'Failed to perform rollback' },
      { status: 500 }
    );
  }
}
