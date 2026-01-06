/**
 * XASE CORE - PDF Legal Report API
 * 
 * POST /api/xase/v1/bundles/:bundleId/pdf
 * 
 * Gera relatório PDF court-ready para um bundle
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/xase/auth';
import { generateAndStorePDFReport } from '@/lib/xase/pdf-report';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bundleId: string }> }
) {
  try {
    // 1. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Extrair bundleId
    const { bundleId } = await context.params;

    // 3. Verificar se bundle existe e pertence ao tenant
    const bundle = await prisma.evidenceBundle.findFirst({
      where: {
        bundleId,
        tenantId: auth.tenantId,
      },
    });

    if (!bundle) {
      return NextResponse.json(
        { error: 'Bundle not found' },
        { status: 404 }
      );
    }

    // 4. Gerar e armazenar PDF report
    const result = await generateAndStorePDFReport(bundleId, auth.tenantId);

    // 5. Retornar URLs e hashes
    return NextResponse.json({
      bundleId,
      pdfReportUrl: result.pdfReportUrl,
      pdfReportHash: result.pdfReportHash,
      pdfReportLogicalHash: result.pdfReportLogicalHash,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[PDF Report] Error:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
